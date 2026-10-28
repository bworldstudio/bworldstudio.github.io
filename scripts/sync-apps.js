/**
 * BWorld Studio — Google Play App Sync Utility
 * Usage:
 *   node scripts/sync-apps.js                   # Auto-discovers and syncs ALL live apps from BWorld Studio
 *   node scripts/sync-apps.js [packageId]       # Syncs a specific package ID (e.g. com.shradhanjali.memorialpostermaker)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const APPS_FILE = path.join(__dirname, '..', 'data', 'apps.json');
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images');
const DEV_URL = 'https://play.google.com/store/apps/developer?id=BWorld+Studio&hl=en';

const PACKAGE_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

// Standard known package IDs to guarantee baseline presence even if Play Store temporarily delays listing
const KNOWN_PACKAGES = [
  'com.ardrawing.trace.sketch',
  'com.shradhanjali.memorialpostermaker'
];

function fetchUrl(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('Invalid URL'));
    }

    if (parsedUrl.protocol !== 'https:') {
      return reject(new Error(`Insecure protocol rejected: ${parsedUrl.protocol}`));
    }

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}, status: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('Invalid image URL'));
    }

    if (parsedUrl.protocol !== 'https:') {
      return reject(new Error(`Insecure image protocol rejected: ${parsedUrl.protocol}`));
    }

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadImage(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) return reject(new Error(`Image download failed: ${res.statusCode}`));
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => resolve(destPath));
    }).on('error', reject);
  });
}

function cleanCategory(cat) {
  if (!cat) return 'Android App';
  if (cat.toUpperCase() === 'ART_AND_DESIGN') return 'Art & Design';
  return cat
    .replace(/^APPLICATION_/i, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Automatically discovers all package IDs published on the BWorld Studio developer page
 */
async function discoverAllPackages() {
  console.log(`Discovering apps from developer page: ${DEV_URL}`);
  const packages = new Set(KNOWN_PACKAGES);

  // Read already known apps from apps.json
  if (fs.existsSync(APPS_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
      if (Array.isArray(existing)) {
        existing.forEach(a => {
          if (a && a.id && PACKAGE_REGEX.test(a.id)) {
            packages.add(a.id);
          }
        });
      }
    } catch {
      // ignore
    }
  }

  try {
    const html = await fetchUrl(DEV_URL);
    const matches = html.match(/\/store\/apps\/details\?id=([a-zA-Z0-9_\.]+)/g) || [];
    for (const m of matches) {
      const pkg = m.split('?id=')[1];
      if (PACKAGE_REGEX.test(pkg) && !pkg.startsWith('com.google') && !pkg.startsWith('com.android')) {
        packages.add(pkg);
      }
    }
  } catch (err) {
    console.warn(`Could not crawl developer page directly: ${err.message}. Using registered package list.`);
  }

  const result = Array.from(packages);
  console.log(`Target packages to sync (${result.length}):`, result.join(', '));
  return result;
}

/**
 * Fetches and processes metadata for a specific package ID
 */
async function syncSingleApp(packageId, existingApps = []) {
  if (!packageId || typeof packageId !== 'string' || !PACKAGE_REGEX.test(packageId) || packageId.length > 128) {
    console.error(`Invalid package ID: "${packageId}". Must follow Android package naming format.`);
    return null;
  }

  console.log(`\nSyncing package: ${packageId}...`);
  const playUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en`;

  try {
    const html = await fetchUrl(playUrl);

    let title = packageId;
    let tagline = 'Creative Android application by BWorld Studio.';
    let category = 'Android App';
    let iconRemoteUrl = null;

    // 1. Primary: Extract from Schema.org JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        if (data.name) title = data.name;
        if (data.description) tagline = data.description;
        if (data.applicationCategory) category = cleanCategory(data.applicationCategory);
        if (data.image) iconRemoteUrl = data.image;
      } catch (err) {
        console.warn(`[${packageId}] JSON-LD parse warning: ${err.message}`);
      }
    }

    // 2. Fallbacks: Flexible Meta Tags
    if (title === packageId) {
      const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<title id="main-title">([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].replace(/ - Apps on Google Play/i, '').replace(/&amp;/g, '&').trim();
    }

    if (tagline === 'Creative Android application by BWorld Studio.') {
      const descMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:og:)?description["']/i);
      if (descMatch) tagline = descMatch[1].replace(/&amp;/g, '&').trim();
    }

    if (!iconRemoteUrl) {
      const iconMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (iconMatch) iconRemoteUrl = iconMatch[1];
    }

    // Request high-resolution version of icon
    if (iconRemoteUrl && !iconRemoteUrl.includes('=s')) {
      iconRemoteUrl = `${iconRemoteUrl}=s512`;
    }

    // Local icon management
    const localIconName = `${packageId.replace(/[^a-zA-Z0-9]/g, '_')}_icon.png`;
    const localIconPath = path.join(IMAGES_DIR, localIconName);
    const iconRelativePath = `assets/images/${localIconName}`;

    if (iconRemoteUrl) {
      try {
        await downloadImage(iconRemoteUrl, localIconPath);
        console.log(`[${packageId}] Saved high-res icon to ${iconRelativePath}`);
      } catch (err) {
        console.warn(`[${packageId}] Could not download local icon: ${err.message}`);
      }
    }

    // Features definition
    const existingIndex = existingApps.findIndex(a => a.id === packageId);
    const existingEntry = existingIndex !== -1 ? existingApps[existingIndex] : null;

    let features = [];
    if (existingEntry && Array.isArray(existingEntry.features) && existingEntry.features.length > 0) {
      features = existingEntry.features;
    } else if (packageId.includes('ardrawing')) {
      features = [
        'Camera overlay projection onto paper for effortless tracing',
        'Diverse sketch template categories to practice drawing',
        'Adjustable outline transparency to suit your drawing setup',
        'Built-in flashlight support for clear drawing in dim settings'
      ];
    } else if (packageId.includes('shradhanjali') || packageId.includes('memorial')) {
      features = [
        'Create Shradhanjali, Besanu, and Condolence cards in minutes',
        'Full support for Hindi, Gujarati, and English languages',
        'Custom photo cropping shapes: Circle, Oval, Square, and Borders',
        'Export and share directly in high-resolution JPG or PDF format'
      ];
    } else {
      features = [
        'Optimized for Android smartphones and tablets',
        'Intuitive and modern user interface',
        'Regular feature updates and performance stability'
      ];
    }

    const appEntry = {
      id: packageId,
      title: title,
      tagline: tagline,
      description: tagline,
      icon: fs.existsSync(localIconPath) ? iconRelativePath : (iconRemoteUrl || 'assets/images/logo.png'),
      playStoreUrl: playUrl,
      category: category,
      badge: 'Live on Google Play',
      features: features,
      isLive: true
    };

    console.log(`[${packageId}] Successfully parsed "${title}" (${category})`);
    return appEntry;
  } catch (err) {
    console.error(`[${packageId}] Error fetching app data: ${err.message}`);
    return null;
  }
}

/**
 * Main Execution Function
 */
async function main() {
  const arg = process.argv[2];

  let existingApps = [];
  if (fs.existsSync(APPS_FILE)) {
    try {
      existingApps = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
      if (!Array.isArray(existingApps)) existingApps = [];
    } catch {
      existingApps = [];
    }
  }

  let packagesToSync = [];
  if (arg && arg !== '--all') {
    packagesToSync = [arg];
  } else {
    packagesToSync = await discoverAllPackages();
  }

  const updatedAppsMap = new Map();
  // Retain existing apps first
  for (const app of existingApps) {
    if (app && app.id) updatedAppsMap.set(app.id, app);
  }

  for (const pkg of packagesToSync) {
    const entry = await syncSingleApp(pkg, existingApps);
    if (entry) {
      updatedAppsMap.set(pkg, entry);
    }
  }

  const finalApps = Array.from(updatedAppsMap.values());
  fs.writeFileSync(APPS_FILE, JSON.stringify(finalApps, null, 2), 'utf8');
  console.log(`\nSuccessfully updated ${APPS_FILE} with ${finalApps.length} live apps!`);
}

main().catch(err => {
  console.error('Fatal sync error:', err);
  process.exitCode = 1;
});
