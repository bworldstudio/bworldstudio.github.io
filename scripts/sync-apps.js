/**
 * BWorld Studio — Google Play App Sync Utility
 * Usage:
 *   node scripts/sync-apps.js [packageId]
 * Example:
 *   node scripts/sync-apps.js com.ardrawing.trace.sketch
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const APPS_FILE = path.join(__dirname, '..', 'data', 'apps.json');
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images');

const PACKAGE_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function fetchUrl(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      return reject(new Error('Too many redirects'));
    }
    
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('Invalid URL'));
    }

    if (parsedUrl.protocol !== 'https:') {
      return reject(new Error(`Insecure protocol rejected: ${parsedUrl.protocol}`));
    }

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
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

    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`Image download failed: ${res.statusCode}`));
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => resolve(destPath));
    }).on('error', reject);
  });
}

async function syncApp(packageId) {
  if (!packageId || typeof packageId !== 'string' || !PACKAGE_REGEX.test(packageId) || packageId.length > 128) {
    console.error(`Invalid package ID: "${packageId}". Must follow Android package naming format (e.g. com.example.app).`);
    process.exitCode = 1;
    return;
  }

  console.log(`Syncing app: ${packageId}...`);
  const playUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en`;

  try {
    const html = await fetchUrl(playUrl);

    // Extract Metadata
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title id="main-title">([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i);
    const iconMatch = html.match(/<img class="T75of [^"]+" src="([^"]+)" itemprop="image"/i) || html.match(/<meta property="og:image" content="([^"]+)"/i);

    let title = titleMatch ? titleMatch[1].replace(/ - Apps on Google Play/i, '').replace(/&amp;/g, '&') : packageId;
    let tagline = descMatch ? descMatch[1].replace(/&amp;/g, '&') : 'Creative mobile application by BWorld Studio.';
    let iconRemoteUrl = iconMatch ? iconMatch[1] : null;

    if (iconRemoteUrl && !iconRemoteUrl.includes('=s')) {
      iconRemoteUrl = `${iconRemoteUrl}=s512`;
    }

    // Save Icon Locally
    const localIconName = `${packageId.replace(/[^a-zA-Z0-9]/g, '_')}_icon.png`;
    const localIconPath = path.join(IMAGES_DIR, localIconName);
    const iconRelativePath = `assets/images/${localIconName}`;

    if (iconRemoteUrl) {
      try {
        await downloadImage(iconRemoteUrl, localIconPath);
        console.log(`Saved icon to ${iconRelativePath}`);
      } catch (err) {
        console.warn(`Could not save local icon, using remote: ${err.message}`);
      }
    }

    // Read existing apps
    let apps = [];
    if (fs.existsSync(APPS_FILE)) {
      try {
        apps = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
      } catch {
        apps = [];
      }
    }

    const newAppEntry = {
      id: packageId,
      title: title,
      tagline: tagline,
      description: tagline,
      icon: fs.existsSync(localIconPath) ? iconRelativePath : (iconRemoteUrl || 'assets/images/logo.jpg'),
      playStoreUrl: playUrl,
      category: 'Android App',
      badge: 'Live on Google Play',
      features: [
        'Optimized for Android smartphones and tablets',
        'Intuitive and modern user interface',
        'Regular feature updates and performance stability'
      ],
      isLive: true
    };

    const existingIndex = apps.findIndex(a => a.id === packageId);
    if (existingIndex !== -1) {
      apps[existingIndex] = { ...apps[existingIndex], ...newAppEntry };
      console.log(`Updated existing app entry for ${packageId}`);
    } else {
      apps.push(newAppEntry);
      console.log(`Added new app entry for ${packageId}`);
    }

    fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2), 'utf8');
    console.log(`Successfully synced ${packageId} to data/apps.json!`);
  } catch (err) {
    console.error(`Error syncing app ${packageId}:`, err.message);
  }
}

const targetPackage = process.argv[2] || 'com.ardrawing.trace.sketch';
syncApp(targetPackage);
