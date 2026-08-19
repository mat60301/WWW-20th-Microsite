document.addEventListener("DOMContentLoaded", () => {
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwd1geSoVKC6w3HIhkv8OOUC9sYHxSBIaOEKWTBwckokwuyZ6tS4te891-ggGhrOEzFDg/exec";

  const statusOverlay = document.getElementById("status-overlay");
  const spinner = document.getElementById("loading-spinner");
  const errorBox = document.getElementById("error-box");
  const errorMessage = document.getElementById("error-message");
  const retryBtn = document.getElementById("retry-btn");

  const tocContainer = document.getElementById("toc");
  const streamContainer = document.getElementById("image-stream");
  const modal = document.getElementById("image-modal");

  let currentIndex = 0;
  let realImageCount = 0;
  let isTicking = false;
  let isTeleporting = false;
  
  let activeClone = null;
  let activeSourceImg = null;

  const SCALE_MIN = 0.40;

  function formatTitle(filename) {
    return filename
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function showLoading() {
    statusOverlay.classList.remove("hidden");
    spinner.classList.remove("hidden");
    errorBox.classList.add("hidden");
  }

  function showError(msg) {
    statusOverlay.classList.remove("hidden");
    spinner.classList.add("hidden");
    errorBox.classList.remove("hidden");
    errorMessage.textContent = msg;
  }

  function hideStatus() {
    statusOverlay.classList.add("hidden");
  }

  retryBtn.addEventListener("click", () => {
    loadDriveImages();
  });

  // Auto-fetch images on startup
  loadDriveImages();
  setupKeyboardControls();
  setupModal();

  async function loadDriveImages() {
    showLoading();

    try {
      const response = await fetch(APPS_SCRIPT_URL);
      if (!response.ok) throw new Error("Failed to fetch Google Drive folder");

      const items = await response.json();

      if (Array.isArray(items) && items.length > 0) {
        hideStatus();
        initGallery(items);
      } else {
        showError("No images found in your Google Drive folder.");
      }
    } catch (err) {
      console.error("Could not load Google Drive images:", err);
      showError("Unable to connect to Google Drive. Please check your network or script URL.");
    }
  }

  function initGallery(items) {
    realImageCount = items.length;
    tocContainer.innerHTML = "";
    streamContainer.innerHTML = "";

    // Build Table of Contents
    items.forEach((item, originalIndex) => {
      const cleanTitle = formatTitle(item.name);

      const tocLink = document.createElement("a");
      tocLink.href = `#`;
      tocLink.className = "toc-item";
      tocLink.textContent = cleanTitle;
      tocLink.id = `toc-link-${originalIndex}`;
      
      tocLink.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToOriginalIndex(originalIndex);
      });

      tocContainer.appendChild(tocLink);
    });

    // Triple Buffer Stream
    const tripleBuffer = [...items, ...items, ...items];

    const observerOptions = {
      root: streamContainer,
      rootMargin: "-45% 0px -45% 0px",
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isTeleporting) {
          const flatIndex = parseInt(entry.target.getAttribute("data-flat-index"), 10);
          currentIndex = flatIndex % realImageCount;
          updateActiveTOC(currentIndex);
        }
      });
    }, observerOptions);

    tripleBuffer.forEach((item, flatIndex) => {
      const originalIndex = flatIndex % realImageCount;
      const cleanTitle = formatTitle(item.name);
      const sectionId = `img-section-${flatIndex}`;

      const cardContainer = document.createElement("article");
      cardContainer.className = "image-card";
      cardContainer.id = sectionId;
      cardContainer.setAttribute("data-flat-index", flatIndex);
      cardContainer.setAttribute("data-original-index", originalIndex);

      const img = document.createElement("img");
      img.src = item.src;
      img.alt = cleanTitle;
      img.loading = "lazy";

      img.onload = () => {
        if (!isTicking) {
          requestAnimationFrame(updateWheelEffect);
          isTicking = true;
        }
      };

      cardContainer.addEventListener("click", () => {
        openModal(img);
      });

      cardContainer.appendChild(img);
      streamContainer.appendChild(cardContainer);

      observer.observe(cardContainer);
    });

    streamContainer.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onScroll);

    requestAnimationFrame(() => {
      const middleSetFirstCard = document.getElementById(`img-section-${realImageCount}`);
      if (middleSetFirstCard) {
        middleSetFirstCard.scrollIntoView({ block: "center" });
      }
      currentIndex = 0;
      updateActiveTOC(0);
      updateWheelEffect();
    });
  }

  function openModal(sourceImg) {
    if (activeClone) return;

    activeSourceImg = sourceImg;
    const sourceRect = sourceImg.getBoundingClientRect();

    const padding = 20;
    const maxW = window.innerWidth - padding * 2;
    const maxH = window.innerHeight - padding * 2;
    const imgRatio = (sourceImg.naturalWidth || sourceRect.width) / (sourceImg.naturalHeight || sourceRect.height);

    let targetW = maxW;
    let targetH = targetW / imgRatio;

    if (targetH > maxH) {
      targetH = maxH;
      targetW = targetH * imgRatio;
    }

    const targetLeft = (window.innerWidth - targetW) / 2;
    const targetTop = (window.innerHeight - targetH) / 2;

    activeClone = sourceImg.cloneNode(true);
    activeClone.className = "expanding-clone";

    activeClone.style.left = `${targetLeft}px`;
    activeClone.style.top = `${targetTop}px`;
    activeClone.style.width = `${targetW}px`;
    activeClone.style.height = `${targetH}px`;

    const deltaX = sourceRect.left - targetLeft;
    const deltaY = sourceRect.top - targetTop;
    const scaleX = sourceRect.width / targetW;
    const scaleY = sourceRect.height / targetH;

    activeClone.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
    activeClone.style.transition = "none";

    document.body.appendChild(activeClone);
    sourceImg.style.visibility = "hidden";

    requestAnimationFrame(() => {
      modal.classList.add("active");
      activeClone.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease";
      activeClone.style.transform = "translate3d(0, 0, 0) scale(1, 1)";
      activeClone.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.5)";
    });

    activeClone.addEventListener("click", closeModal);
  }

  function closeModal() {
    if (!activeClone || !activeSourceImg) return;

    const cloneToClose = activeClone;
    const imgToRestore = activeSourceImg;
    activeClone = null;
    activeSourceImg = null;

    const sourceRect = imgToRestore.getBoundingClientRect();
    const targetLeft = parseFloat(cloneToClose.style.left);
    const targetTop = parseFloat(cloneToClose.style.top);
    const targetW = parseFloat(cloneToClose.style.width);
    const targetH = parseFloat(cloneToClose.style.height);

    const deltaX = sourceRect.left - targetLeft;
    const deltaY = sourceRect.top - targetTop;
    const scaleX = sourceRect.width / targetW;
    const scaleY = sourceRect.height / targetH;

    modal.classList.remove("active");

    cloneToClose.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease";
    cloneToClose.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
    cloneToClose.style.boxShadow = "10px 10px 25px rgba(0, 0, 0, 0.45)";

    setTimeout(() => {
      imgToRestore.style.visibility = "visible";
      if (cloneToClose.parentNode) {
        cloneToClose.parentNode.removeChild(cloneToClose);
      }
    }, 500);
  }

  function setupModal() {
    modal.addEventListener("click", closeModal);
  }

  function updateWheelEffect() {
    const totalScrollHeight = streamContainer.scrollHeight;
    const singleSetHeight = totalScrollHeight / 3;
    const currentScrollTop = streamContainer.scrollTop;

    if (currentScrollTop < singleSetHeight * 0.5) {
      isTeleporting = true;
      streamContainer.scrollTop += singleSetHeight;
      isTeleporting = false;
    } else if (currentScrollTop > singleSetHeight * 2.5) {
      isTeleporting = true;
      streamContainer.scrollTop -= singleSetHeight;
      isTeleporting = false;
    }

    const containerRect = streamContainer.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;
    const cards = streamContainer.querySelectorAll(".image-card");
    const halfContainerHeight = containerRect.height / 2;
    const viewportWidth = window.innerWidth;
    const unscaledLeft = viewportWidth * 0.5;

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const distanceFromCenter = cardCenter - containerCenter;

      const unscaledHeight = card.offsetHeight;
      const unscaledWidth = card.offsetWidth;

      const maxDist = halfContainerHeight + (unscaledHeight * SCALE_MIN) / 2;
      const normalizedDist = Math.min(1, Math.max(0, Math.abs(distanceFromCenter) / maxDist));

      const scale = 1 - (normalizedDist * (1 - SCALE_MIN));

      const targetRightShift = (viewportWidth - unscaledLeft) - (unscaledWidth * scale);
      const translateX = Math.max(0, targetRightShift * normalizedDist);

      const sign = distanceFromCenter >= 0 ? 1 : -1;
      const translateY = -sign * (1 - scale) * (unscaledHeight / 2);

      const opacity = 1 - (normalizedDist * 0.35);

      card.style.transform = `translateX(${translateX}px) translateY(${translateY}px) scale(${scale})`;
      card.style.opacity = opacity;
    });

    isTicking = false;
  }

  function onScroll() {
    if (!isTicking) {
      requestAnimationFrame(updateWheelEffect);
      isTicking = true;
    }
  }

  function scrollToOriginalIndex(targetOriginalIndex) {
    const cards = Array.from(streamContainer.querySelectorAll(".image-card"));
    const containerRect = streamContainer.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    const matchingCards = cards.filter(card => 
      parseInt(card.getAttribute("data-original-index"), 10) === targetOriginalIndex
    );

    let closestCard = matchingCards[0];
    let minDistance = Infinity;

    matchingCards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const dist = Math.abs(cardCenter - containerCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestCard = card;
      }
    });

    if (closestCard) {
      closestCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function updateActiveTOC(activeIndex) {
    const links = tocContainer.querySelectorAll(".toc-item");
    links.forEach((link, idx) => {
      if (idx === activeIndex) {
        link.classList.add("active");
        link.scrollIntoView({ block: "nearest" });
      } else {
        link.classList.remove("active");
      }
    });
  }

  function setupKeyboardControls() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal();
        return;
      }

      if (activeClone) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % realImageCount;
        scrollToOriginalIndex(nextIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + realImageCount) % realImageCount;
        scrollToOriginalIndex(prevIndex);
      }
    });
  }
});