const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, 'images50');
const htmlFile = path.join(__dirname, 'index.html');
const adLinksFile = path.join(__dirname, 'ad-links.json');
const imageExtensions = /\.(png|jpe?g|webp|gif|svg)$/i;

function formatTitle(filename) {
  return filename
    .replace(/\.[^/.]+$/, "")            // 1. Remove file extension
    .replace(/^[_-\s]*\d+[\s-_]*/, "")   // 2. Remove leading digits, underscores, dashes, & spaces
    .replace(/[-_]/g, " ")               // 3. Replace remaining dashes/underscores with spaces
    .replace(/\s+/g, " ")                // 4. Collapse multiple spaces
    .trim();                             // 5. Trim whitespace
}

// Extract number prefix for ad-links matching (e.g. "_10-EDITOR'S-LETTER.jpg" -> "10")
function extractImageNumber(filename) {
  const match = filename.match(/\d+/);
  return match ? match[0] : null;
}

fs.readdir(imagesDir, (err, files) => {
  if (err) {
    console.error('Error reading images directory:', err);
    process.exit(1);
  }

  // Load ad links if ad-links.json exists
  let adLinksMap = {};
  if (fs.existsSync(adLinksFile)) {
    try {
      adLinksMap = JSON.parse(fs.readFileSync(adLinksFile, 'utf8'));
      console.log('Successfully loaded ad-links.json');
    } catch (e) {
      console.warn('Warning: Could not parse ad-links.json. Proceeding without ad links.');
    }
  }

  // Sort files numerically by filename
  const validFiles = files
    .filter(file => imageExtensions.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (validFiles.length === 0) {
    console.error('No valid images found in /images50 directory.');
    process.exit(1);
  }

  // 1. Generate TOC Links (preserves [br] as a single <a> element spanning two lines)
  const tocItems = [];
  validFiles.forEach((file, originalIndex) => {
    const rawTitle = formatTitle(file);

    if (rawTitle.length > 0) {
      // Replace [br] case-insensitively with a real <br> tag inside a single <a> element
      const formattedTitle = rawTitle.replace(/\[br\]/gi, "<br>");
      
      tocItems.push(
        `<a href="#" class="toc-item" id="toc-link-${originalIndex}" data-original-index="${originalIndex}">${formattedTitle}</a>`
      );
    }
  });

  const tocHtml = tocItems.join('\n        ');

  // 2. Generate Triple-Buffer Stream
  const tripleBuffer = [...validFiles, ...validFiles, ...validFiles];
  const realCount = validFiles.length;

  const streamHtml = tripleBuffer.map((file, flatIndex) => {
    const originalIndex = flatIndex % realCount;
    const title = formatTitle(file).replace(/\[br\]/gi, " ") || `Image ${originalIndex + 1}`;
    const imgNumber = extractImageNumber(file);

    // Retrieve ad link configuration (Object or String)
    const adConfig = adLinksMap[imgNumber] || adLinksMap[file] || null;

    let adUrl = null;
    let adPosition = "full";

    if (adConfig) {
      if (typeof adConfig === 'object') {
        adUrl = adConfig.url && adConfig.url.trim() !== "" ? adConfig.url : null;
        adPosition = adConfig.position || "full";
      } else if (typeof adConfig === 'string' && adConfig.trim() !== "") {
        adUrl = adConfig;
        adPosition = "full";
      }
    }

    const imgTag = `<img src="images50/${file}" alt="${title}" class="loaded">`;
    
    let content = imgTag;
    let hasAdClass = '';
    let dataAdPos = '';

    if (adUrl) {
      hasAdClass = ' has-ad-link';
      dataAdPos = ` data-ad-pos="${adPosition}"`;
      
      const adOverlay = `<a href="${adUrl}" target="_blank" rel="noopener noreferrer" class="ad-link-overlay ad-pos-${adPosition}" aria-label="Advertisement Link"></a>`;
      content = `<div class="card-media-wrapper">${imgTag}${adOverlay}</div>`;
    } else {
      content = `<div class="card-media-wrapper">${imgTag}</div>`;
    }

    return `<article class="image-card${hasAdClass}" id="img-section-${flatIndex}" data-flat-index="${flatIndex}" data-original-index="${originalIndex}"${dataAdPos}>${content}</article>`;
  }).join('\n      ');

  // 3. Inject directly into index.html
  fs.readFile(htmlFile, 'utf8', (err, htmlData) => {
    if (err) {
      console.error('Error reading index.html:', err);
      process.exit(1);
    }

    let updatedHtml = htmlData.replace(
      /<!-- TOC_START -->[\s\S]*?<!-- TOC_END -->/,
      `<!-- TOC_START -->\n        ${tocHtml}\n        <!-- TOC_END -->`
    );

    updatedHtml = updatedHtml.replace(
      /<!-- STREAM_START -->[\s\S]*?<!-- STREAM_END -->/,
      `<!-- STREAM_START -->\n      ${streamHtml}\n      <!-- STREAM_END -->`
    );

    fs.writeFile(htmlFile, updatedHtml, 'utf8', (err) => {
      if (err) {
        console.error('Error writing index.html:', err);
        process.exit(1);
      }
      console.log(`Successfully injected ${tocItems.length} TOC items and ${validFiles.length} stream cards (with positional ad links) into index.html!`);
    });
  });
});