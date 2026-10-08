document.addEventListener("DOMContentLoaded", () => {
  const tocContainer = document.getElementById("toc");
  const streamContainer = document.getElementById("image-stream");
  const sidebar = document.querySelector(".sidebar");

  const cards = streamContainer.querySelectorAll(".image-card");

  // Calculate real unique image count from total DOM cards (triple buffer set)
  const totalCardsCount = cards.length;
  const realImageCount = totalCardsCount > 0 ? totalCardsCount / 3 : 0;

  if (realImageCount === 0) return;

  // Create & Inject Mobile Drawer Backdrop
  const drawerBackdrop = document.createElement("div");
  drawerBackdrop.className = "drawer-backdrop";
  document.querySelector(".app-container").appendChild(drawerBackdrop);

  let currentIndex = 0;
  let isTicking = false;
  let isTeleporting = false;
  let isDrawerOpen = false;
  let isInitialLoad = true;

  const SCALE_MIN = 0.70;
  const SHADOW_OFFSET_MAX = 5;
  const SHADOW_BLUR_MAX = 12;
  const SHADOW_ALPHA_MAX = 0.35;

  // Mobile Drawer Control Functions
  const drawerToggle = document.getElementById("drawer-toggle");

  function openDrawer() {
    isDrawerOpen = true;
    sidebar.classList.add("is-open");
    drawerBackdrop.classList.add("is-open");
    if (drawerToggle) drawerToggle.innerHTML = "CLOSE";
  }

  function closeDrawer() {
    isDrawerOpen = false;
    sidebar.classList.remove("is-open");
    drawerBackdrop.classList.remove("is-open");
    if (drawerToggle) drawerToggle.innerHTML = "EXPLORE";
  }

  function toggleDrawer() {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  if (drawerToggle) {
    drawerToggle.addEventListener("click", toggleDrawer);
  }
  drawerBackdrop.addEventListener("click", closeDrawer);

  // Helper function to set the active class on a target TOC element
  function setTOCActiveElement(targetLink, shouldScroll = true) {
    const currentTocLinks = tocContainer.querySelectorAll(".toc-item");
    currentTocLinks.forEach((link) => {
      if (link === targetLink) {
        link.classList.add("active");
        if (shouldScroll) {
          keepActiveTocInView(link);
        }
      } else {
        link.classList.remove("active");
      }
    });
  }

  // Custom TOC scroll positioning to keep active item ~5 items above the bottom fade zone
  function keepActiveTocInView(activeItem) {
    const tocWrapper = document.getElementById("toc-wrapper");
    if (!tocWrapper || !activeItem) return;

    const itemHeight = activeItem.offsetHeight || 28; // Standard line height (~28px)
    const offsetBuffer = itemHeight * 5;              // 5-item buffer height (~140px)

    const wrapperRect = tocWrapper.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();

    // 1. Trigger scroll down if active item enters the 5-item bottom threshold
    if (itemRect.bottom > (wrapperRect.bottom - offsetBuffer)) {
      tocWrapper.scrollTop += (itemRect.bottom - (wrapperRect.bottom - offsetBuffer));
    } 
    // 2. Trigger scroll up if active item enters the top threshold
    else if (itemRect.top < (wrapperRect.top + itemHeight)) {
      tocWrapper.scrollTop -= ((wrapperRect.top + itemHeight) - itemRect.top);
    }
  }

  // Setup TOC Click Handlers (Queried dynamically from current DOM)
  tocContainer.querySelectorAll(".toc-item").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const originalIndex = parseInt(link.getAttribute("data-original-index"), 10);

      // Force instant active styling on click
      setTOCActiveElement(link, true);

      // Scroll carousel stream to target image section
      scrollToOriginalIndex(originalIndex);

      if (window.innerWidth < 800) {
        closeDrawer();
      }
    });
  });

  // Setup "IN THIS ISSUE" Header Click Handler -> Scrolls to Entry 0
  const sidebarHeader = sidebar.querySelector(".sidebar-header h2");
  if (sidebarHeader) {
    sidebarHeader.style.cursor = "pointer";
    sidebarHeader.addEventListener("click", () => {
      scrollToOriginalIndex(0);

      if (window.innerWidth < 800) {
        closeDrawer();
      }
    });
  }

  // ==========================================================================
  // DIRECT ZOOM & DRAG-TO-PAN LIGHTBOX (With Zoomed Split-Ad Support)
  // ==========================================================================
  const modal = document.getElementById("image-modal");
  const modalPanContainer = document.getElementById("modal-pan-container");
  const modalImgWrapper = document.getElementById("modal-img-wrapper");
  const modalImgZoomed = document.getElementById("modal-img-zoomed");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  let isDragging = false;
  let dragMoved = false; // Flag to distinguish drag pan from a simple click
  let startX = 0, startY = 0;
  let currentX = 0, currentY = 0;

  // Open Modal directly on click of content
  cards.forEach((card) => {
    const adPos = card.getAttribute("data-ad-pos");
    const adOverlayLink = card.querySelector(".ad-link-overlay");
    const adUrl = adOverlayLink ? adOverlayLink.getAttribute("href") : null;

    // Skip full-page ad cards completely (they navigate externally via overlay)
    if (adPos === "full") return;

    const img = card.querySelector("img");
    if (img) {
      img.addEventListener("click", (e) => {
        // If an overlay element handles an ad click on this spread, ignore zoom
        if (e.target.classList.contains("ad-link-overlay")) return;

        if (!modal || !modalImgZoomed) return;

        // 1. Immediately open with the low-res cached image
        modalImgZoomed.src = img.src;
        modalImgZoomed.alt = img.alt;

        // 2. Derive HD URL by swapping 'images50' with 'imagesZoom'
        const lowResSrc = img.src;
        const highResSrc = lowResSrc.replace("/images50/", "/imagesZoom/").replace("images50/", "imagesZoom/");

        // 3. Swap in high-res asset asynchronously on demand
        const hdLoader = new Image();
        hdLoader.src = highResSrc;
        hdLoader.onload = () => {
          if (modal.classList.contains("active")) {
            modalImgZoomed.src = highResSrc;
          }
        };
        
        // Set dynamic zoom scale based on viewport width (< 800px = Mobile)
        const isMobile = window.innerWidth < 800;
        modalImgZoomed.style.width = isMobile ? "300vw" : "200vw";

        // Remove old zoom overlays if any
        const existingOverlay = modalImgWrapper.querySelector(".modal-ad-overlay");
        if (existingOverlay) existingOverlay.remove();

        // Inject ad overlay over zoomed image if this card has a split ad
        if (adUrl && (adPos === "left" || adPos === "right")) {
          const zoomOverlay = document.createElement("a");
          zoomOverlay.className = `modal-ad-overlay ad-pos-${adPos}`;
          zoomOverlay.href = adUrl;
          zoomOverlay.target = "_blank";
          zoomOverlay.rel = "noopener noreferrer";

          // Intercept click on zoomed ad: only open link if user didn't drag/pan
          zoomOverlay.addEventListener("click", (evt) => {
            if (dragMoved) {
              evt.preventDefault();
              evt.stopPropagation();
            }
          });

          modalImgWrapper.appendChild(zoomOverlay);
        }

        // Reset offsets to dead center
        currentX = 0;
        currentY = 0;
        modalImgZoomed.style.transition = "none";
        modalImgWrapper.style.transform = `translate3d(0px, 0px, 0px)`;
        
        modal.classList.add("active");
      });
    }
  });

  function closeModal() {
    if (modal) modal.classList.remove("active");
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  // Prevent browser native image drag preview ghost
  if (modalImgZoomed) {
    modalImgZoomed.addEventListener("dragstart", (e) => e.preventDefault());
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // Mousedown / Touchstart: Immediately initiate drag mode
  function startDrag(e) {
    if (!modalImgZoomed || !modal.classList.contains("active")) return;
    
    if (e.cancelable) e.preventDefault();

    isDragging = true;
    dragMoved = false;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    startX = clientX - currentX;
    startY = clientY - currentY;
  }

  // Mousemove / Touchmove: Pan live as cursor moves
  function moveDrag(e) {
    if (!isDragging || !modalImgZoomed) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rawX = clientX - startX;
    const rawY = clientY - startY;

    if (Math.abs(rawX - currentX) > 5 || Math.abs(rawY - currentY) > 5) {
      dragMoved = true;
    }

    const imgRect = modalImgZoomed.getBoundingClientRect();
    const maxDragX = Math.max(0, (imgRect.width - window.innerWidth) / 2);
    const maxDragY = Math.max(0, (imgRect.height - window.innerHeight) / 2);

    currentX = clamp(rawX, -maxDragX, maxDragX);
    currentY = clamp(rawY, -maxDragY, maxDragY);

    modalImgWrapper.style.transform = `translate3d(${currentX}px, ${currentY}px, 0px)`;
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
  }

  if (modalPanContainer) {
    modalPanContainer.addEventListener("mousedown", startDrag);
    modalPanContainer.addEventListener("touchstart", startDrag, { passive: false });

    window.addEventListener("mousemove", moveDrag);
    window.addEventListener("touchmove", moveDrag, { passive: false });

    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);

    modalPanContainer.addEventListener("click", (e) => {
      // If user clicked background or content without dragging, close modal
      if (!dragMoved && !e.target.classList.contains("modal-ad-overlay")) {
        closeModal();
      }
    });
  }

  // Close modal on background backdrop click
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // ==========================================================================
  // STREAM OBSERVER & SCROLL LOGIC
  // ==========================================================================
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

  cards.forEach(card => observer.observe(card));

  streamContainer.addEventListener("scroll", onScroll);
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 800 && isDrawerOpen) {
      closeDrawer();
    }
    onScroll();
  });

  // Custom Smooth Scroll Helper (supports specific duration in ms)
  function animateScrollTo(container, targetY, duration) {
    const startY = container.scrollTop;
    const distance = targetY - startY;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out cubic curve (decelerates nicely at the end)
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      container.scrollTop = startY + distance * easeProgress;
      updateWheelEffect();

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  // Helper to ensure all image elements in the carousel have reported dimensions
  function waitForAllImages() {
    const allImgs = Array.from(streamContainer.querySelectorAll("img"));
    const promises = allImgs.map(img => {
      if (img.complete && img.naturalHeight !== 0) {
        return Promise.resolve();
      }
      return new Promise(resolve => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    });
    return Promise.all(promises);
  }

  // Universal Intro Scroll Setup (Local & Live Compatible)
  window.addEventListener("load", async () => {
    let isDismissed = false;
    const startTime = Date.now();
    const SVG_LOOP_DURATION = 4500; // Matches the exact 3.875s duration of loading-animation.svg

    // 1. Force TOC container to start cleanly at top on load
    const tocWrapper = document.getElementById("toc-wrapper");
    if (tocWrapper) {
      tocWrapper.scrollTop = 0;
    }

    const loadingOverlay = document.getElementById("loading-overlay");

    const triggerSlowScroll = () => {
      const targetCard = document.getElementById(`img-section-${realImageCount}`);
      if (!targetCard) return;

      isTeleporting = true;

      const containerRect = streamContainer.getBoundingClientRect();
      const cardTrueCenter = targetCard.offsetTop + (targetCard.offsetHeight / 2);
      const targetScrollTop = cardTrueCenter - (containerRect.height / 2);

      animateScrollTo(streamContainer, targetScrollTop, 3000);

      setTimeout(() => {
        isTeleporting = false;
        isInitialLoad = false;
      }, 3100);
    };

    function dismissOverlay() {
      if (isDismissed) return;
      isDismissed = true;

      if (loadingOverlay) {
        loadingOverlay.classList.add("is-hidden");
        setTimeout(triggerSlowScroll, 200);
      } else {
        triggerSlowScroll();
      }
    }

    // 2. Await all carousel image downloads
    await waitForAllImages();

    // 3. Align initial scroll position behind overlay silently
    const startCardIndex = Math.max(0, realImageCount - 5);
    const startCard = document.getElementById(`img-section-${startCardIndex}`);
    if (startCard) {
      isTeleporting = true;
      const containerRect = streamContainer.getBoundingClientRect();
      const cardTrueCenter = startCard.offsetTop + (startCard.offsetHeight / 2);
      streamContainer.scrollTop = cardTrueCenter - (containerRect.height / 2);
      updateWheelEffect();
      isTeleporting = false;
    }

    // 4. Ensure the animation plays for at least 1 full 3.875s visual cycle
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime < SVG_LOOP_DURATION) {
      setTimeout(dismissOverlay, SVG_LOOP_DURATION - elapsedTime);
    } else {
      const remainingForCurrentLoop = SVG_LOOP_DURATION - (elapsedTime % SVG_LOOP_DURATION);
      setTimeout(dismissOverlay, remainingForCurrentLoop);
    }
  });

  // Dynamic Wheel Effect and Dropshadow Calculation
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
    const halfContainerHeight = containerRect.height / 2;

    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const distanceFromCenter = cardCenter - containerCenter;

      const unscaledHeight = card.offsetHeight;

      const maxDist = halfContainerHeight + (unscaledHeight * SCALE_MIN) / 2;
      const normalizedDist = Math.min(1, Math.max(0, Math.abs(distanceFromCenter) / maxDist));

      const scale = 1 - (normalizedDist * (1 - SCALE_MIN));

      const translateX = 0;

      const sign = distanceFromCenter >= 0 ? 1 : -1;
      const translateY = -sign * (1 - scale) * (unscaledHeight / 2);

      // Full opacity (1.0) within the middle 40%-60% zone, fading out faster toward the edges
      const fadeThreshold = 0.5;
      const opacity = normalizedDist <= fadeThreshold 
        ? 1 
        : Math.max(0, 1 - ((normalizedDist - fadeThreshold) / (1 - fadeThreshold)) * 0.85);

      const shadowProgress = Math.max(0, 1 - normalizedDist);
      const currentOffset = (SHADOW_OFFSET_MAX * shadowProgress).toFixed(1);
      const currentBlur = (SHADOW_BLUR_MAX * shadowProgress).toFixed(1);
      const currentAlpha = (SHADOW_ALPHA_MAX * shadowProgress).toFixed(2);

      const img = card.querySelector("img");
      if (img) {
        img.style.boxShadow = `${currentOffset}px ${currentOffset}px ${currentBlur}px rgba(0, 0, 0, ${currentAlpha})`;
      }

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
    const containerRect = streamContainer.getBoundingClientRect();
    const containerCenter = streamContainer.scrollTop + (containerRect.height / 2);

    // Find all matching triple-buffered cards for this index
    const matchingCards = Array.from(cards).filter(card => 
      parseInt(card.getAttribute("data-original-index"), 10) === targetOriginalIndex
    );

    let closestCard = matchingCards[0];
    let minDistance = Infinity;

    // Determine which duplicate set of the card is closest to current viewport center
    matchingCards.forEach((card) => {
      const cardUnscaledHeight = card.offsetHeight;
      const cardTrueCenter = card.offsetTop + (cardUnscaledHeight / 2);
      const dist = Math.abs(cardTrueCenter - containerCenter);
      
      if (dist < minDistance) {
        minDistance = dist;
        closestCard = card;
      }
    });

    if (closestCard) {
      // Calculate unscaled true center scroll target
      const cardUnscaledHeight = closestCard.offsetHeight;
      const cardTrueCenter = closestCard.offsetTop + (cardUnscaledHeight / 2);
      const targetScrollTop = cardTrueCenter - (containerRect.height / 2);

      // Lock teleportation during TOC navigation scroll pass
      isTeleporting = true;

      // Smoothly animate to exact dead-center over 800ms
      animateScrollTo(streamContainer, targetScrollTop, 800);

      setTimeout(() => {
        isTeleporting = false;
      }, 850);
    }
  }

  function updateActiveTOC(currentImageIndex) {
    const currentTocLinks = Array.from(tocContainer.querySelectorAll(".toc-item"));
    if (currentTocLinks.length === 0) return;

    // Get the index of the very first TOC item (Editor's Letter = index 10)
    const firstTocIndex = parseInt(currentTocLinks[0].getAttribute("data-original-index"), 10);

    // If the current image is BEFORE the first TOC entry (e.g. cover or ads 0-9), clear all highlights
    if (currentImageIndex < firstTocIndex) {
      currentTocLinks.forEach((link) => link.classList.remove("active"));
      return;
    }

    let activeTocLink = currentTocLinks[0];
    for (let i = 0; i < currentTocLinks.length; i++) {
      const linkIndex = parseInt(currentTocLinks[i].getAttribute("data-original-index"), 10);
      if (linkIndex <= currentImageIndex) {
        activeTocLink = currentTocLinks[i];
      } else {
        break;
      }
    }

    // On initial load, highlight active link without shifting the scroll wrapper
    setTOCActiveElement(activeTocLink, !isInitialLoad);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (isDrawerOpen) closeDrawer();
      if (modal && modal.classList.contains("active")) {
        modal.classList.remove("active");
      }
      return;
    }

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

  // TOC Scroll Indicator (Auto-hide down arrow when scrolled to bottom & Click to Scroll)
  const tocWrapper = document.getElementById("toc-wrapper");
  const tocIndicator = document.getElementById("toc-scroll-indicator");

  function updateTOCScrollIndicator() {
    if (!tocWrapper || !tocIndicator) return;

    // Check if scrolled near the bottom
    const isAtBottom = tocWrapper.scrollHeight - tocWrapper.scrollTop <= tocWrapper.clientHeight + 5;
    
    // Check if the content is short enough that no scrolling is needed
    const isScrollable = tocWrapper.scrollHeight > tocWrapper.clientHeight;

    if (isAtBottom || !isScrollable) {
      tocIndicator.classList.add("is-hidden");
    } else {
      tocIndicator.classList.remove("is-hidden");
    }
  }

  if (tocWrapper) {
    tocWrapper.addEventListener("scroll", updateTOCScrollIndicator);
    updateTOCScrollIndicator();
  }

  // Add click handler to scroll down the TOC list
  if (tocIndicator && tocWrapper) {
    tocIndicator.addEventListener("click", () => {
      // Scrolls down by roughly 5 TOC items (~240px)
      tocWrapper.scrollBy({
        top: 240,
        behavior: "smooth"
      });
    });
  }
});