/**
 * BWorld Studio — Interactive & Dynamic Script
 * Features:
 * - Dynamic App Rendering from data/apps.json (Automatic App Display)
 * - Navbar Scroll Effect & Mobile Drawer
 * - Cursor Spotlight Glow
 * - Support Email Copy with Toast Notification
 * - Fully Responsive Layout Support
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initCursorSpotlight();
  loadAndRenderApps();
  initContactAndCopy();
});

/* ================= Dynamic App Rendering Mechanism ================= */
// Default fallback app in case of local file:// protocol or offline access
const DEFAULT_APPS = [
  {
    id: "com.ardrawing.trace.sketch",
    title: "AR Drawing - Trace & Sketch",
    tagline: "Draw with AR! Trace any image, sketch easily, and improve your drawing skills.",
    description: "Transform your mobile device into an augmented reality drawing companion. Project virtual sketch templates onto physical paper through your smartphone camera to easily learn drawing and improve your sketching skills.",
    icon: "assets/images/com_ardrawing_trace_sketch_icon.png",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.ardrawing.trace.sketch",
    category: "Art & Design",
    badge: "Live on Google Play",
    features: [
      "Camera overlay projection onto paper for effortless tracing",
      "Diverse sketch template categories to practice drawing",
      "Adjustable outline transparency to suit your drawing setup",
      "Built-in flashlight support for clear drawing in dim settings"
    ]
  }
];

async function loadAndRenderApps() {
  const container = document.getElementById('apps-container');
  if (!container) return;

  let apps = DEFAULT_APPS;

  try {
    const res = await fetch('data/apps.json?v=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        apps = data;
      }
    }
  } catch (err) {
    console.log('Using default apps list (fetch offline/file protocol):', err.message);
  }

  renderAppCards(container, apps);
}

function sanitizeUrl(url, fallback = '#') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (/^https:\/\/play\.google\.com\//i.test(trimmed) || /^https:\/\//i.test(trimmed) || /^assets\/images\//i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function renderAppCards(container, apps) {
  container.innerHTML = apps.map((app, index) => {
    const rawIcon = app.icon || 'assets/images/com_ardrawing_trace_sketch_icon.png';
    const iconSrc = sanitizeUrl(rawIcon, 'assets/images/logo.png');
    const safePlayUrl = sanitizeUrl(app.playStoreUrl, 'https://play.google.com/store/apps/developer?id=BWorld+Studio');

    const featuresHtml = (app.features || []).map(feat => `
      <li>
        <span class="feature-check">✓</span>
        <span>${escapeHtml(feat)}</span>
      </li>
    `).join('');

    return `
      <article class="app-card ${apps.length === 1 ? 'flagship' : 'standard'}">
        <div class="app-card-media">
          <img 
            src="${escapeHtml(iconSrc)}" 
            alt="${escapeHtml(app.title)} Icon" 
            class="app-real-icon" 
            width="140" 
            height="140" 
            loading="${index === 0 ? 'eager' : 'lazy'}"
            onerror="this.onerror=null; this.src='assets/images/logo.png';"
          />
        </div>

        <div class="app-card-content">
          <div class="card-top">
            <div class="card-badges">
              <span class="badge-pill badge-live">✓ ${escapeHtml(app.badge || 'Live on Google Play')}</span>
              <span class="badge-pill badge-upcoming">${escapeHtml(app.category || 'Android')}</span>
            </div>
          </div>

          <h3 class="card-title">${escapeHtml(app.title)}</h3>
          <p class="card-tagline">${escapeHtml(app.tagline || app.description)}</p>

          ${featuresHtml ? `<ul class="card-features">${featuresHtml}</ul>` : ''}

          <div class="card-footer">
            <a href="${escapeHtml(safePlayUrl)}" target="_blank" rel="noopener noreferrer" class="play-badge-link" aria-label="Get ${escapeHtml(app.title)} on Google Play">
              <img src="assets/images/google-play-badge.png" alt="Get it on Google Play" height="52" style="height: 52px; width: auto;" />
            </a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

/* ================= Navbar & Mobile Navigation ================= */
function initNavbar() {
  const header = document.querySelector('.site-header') || document.querySelector('.navbar');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const navLinks = document.querySelector('.nav-links');
  const links = navLinks ? navLinks.querySelectorAll('a') : [];

  window.addEventListener('scroll', () => {
    if (window.scrollY > 25) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      const isExpanded = navLinks.classList.toggle('active');
      mobileToggle.setAttribute('aria-expanded', isExpanded);
      const spans = mobileToggle.querySelectorAll('span');
      if (isExpanded) {
        spans[0].style.transform = 'translateY(7px) rotate(45deg)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
      } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      }
    });

    links.forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        mobileToggle.setAttribute('aria-expanded', 'false');
        const spans = mobileToggle.querySelectorAll('span');
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      });
    });
  }
}

/* ================= Cursor Spotlight Glow ================= */
function initCursorSpotlight() {
  const spotlight = document.getElementById('cursor-spotlight');
  if (!spotlight || window.matchMedia('(pointer: coarse)').matches) {
    if (spotlight) spotlight.style.display = 'none';
    return;
  }

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  function renderSpotlight() {
    currentX += (mouseX - currentX) * 0.15;
    currentY += (mouseY - currentY) * 0.15;
    spotlight.style.left = `${currentX}px`;
    spotlight.style.top = `${currentY}px`;
    requestAnimationFrame(renderSpotlight);
  }
  requestAnimationFrame(renderSpotlight);
}

/* ================= Contact, Copy Email & Toast Notification ================= */
function initContactAndCopy() {
  const copyBtn = document.getElementById('copy-email-btn');
  const supportEmail = 'bworldstudio@gmail.com';

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(supportEmail);
        showToast(`Copied ${supportEmail} to clipboard!`);
      } catch {
        const tempInput = document.createElement('input');
        tempInput.value = supportEmail;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showToast(`Copied ${supportEmail} to clipboard!`);
      }
    });
  }

  const contactForm = document.getElementById('support-contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('user-name')?.value || 'User';
      const email = document.getElementById('user-email')?.value || '';
      const message = document.getElementById('user-message')?.value || '';

      const subject = encodeURIComponent(`BWorld Studio Inquiry from ${name}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);

      window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
      showToast('Opening your email client to send message!');
      contactForm.reset();
    });
  }
}

function showToast(message) {
  let toast = document.querySelector('.toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }

  toast.textContent = '';
  const iconSpan = document.createElement('span');
  iconSpan.textContent = '✓';
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(textSpan);
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}
