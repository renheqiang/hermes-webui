// ── Wallpaper ──────────────────────────────────────────────────────────────
// Applies a custom user-uploaded background image and brightness adjustment.
// Storage is server-side at ~/.hermes/webui/wallpaper-<hash>.{ext}; brightness
// is a CSS variable on :root, persisted in settings.json.
//
// Public API:
//   applyWallpaper()           — boot + post-upload: read /api/wallpaper/info
//                                and update DOM (wallpaper div + brightness var)
//   uploadWallpaper(file)      — POST raw bytes to /api/wallpaper
//   removeWallpaper()          — POST /api/wallpaper/delete + clear DOM
//   setBrightness(percent)     — update --wallpaper-brightness CSS var
//                                (does NOT persist; persistence is via Save in panel)

const _WALLPAPER_ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
]);
const _WALLPAPER_MAX_BYTES = 5_000_000;

async function applyWallpaper(){
  let info;
  try{
    info = await api('/api/wallpaper/info');
  }catch(e){
    // Silent failure on boot -- user just sees theme color (fallback).
    console.warn('applyWallpaper failed', e);
    return;
  }
  const root = document.documentElement;
  const div = document.getElementById('wallpaper');
  if(!div) return;

  // Brightness applies regardless of whether a wallpaper is set (no-op if
  // no wallpaper, but the CSS var should still be in sync with settings).
  if(typeof info.brightness === 'number'){
    root.style.setProperty('--wallpaper-brightness', String(info.brightness));
  }

  if(info.has_wallpaper && info.file){
    // ?v=<hash> for cache busting -- file name itself includes the hash but
    // browsers may key cache by URL, so the query string is belt-and-suspenders.
    const hash = info.file.replace(/^wallpaper-/, '').replace(/\.[a-z]+$/, '');
    div.style.backgroundImage = `url("/api/wallpaper?v=${encodeURIComponent(hash)}")`;
    div.setAttribute('data-active', '');
  }else{
    div.style.backgroundImage = '';
    div.removeAttribute('data-active');
  }
}

async function uploadWallpaper(file){
  if(!file) return;
  // Local pre-check: type + size
  if(!_WALLPAPER_ALLOWED_TYPES.has(file.type)){
    showToast(t('wallpaper_invalid_format'));
    return;
  }
  if(file.size > _WALLPAPER_MAX_BYTES){
    showToast(t('wallpaper_size_too_large'));
    return;
  }
  try{
    const buf = await file.arrayBuffer();
    const res = await fetch('/api/wallpaper', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': file.type},
      body: buf,
    });
    if(!res.ok){
      let msg;
      try{ msg = (await res.json()).error; }catch(_){ msg = await res.text(); }
      showToast(msg || ('Upload failed: ' + res.status));
      return;
    }
    await applyWallpaper();
    showToast(t('wallpaper_uploaded'));
  }catch(e){
    showToast(t('failed_colon') + e.message);
  }
}

async function removeWallpaper(){
  try{
    await api('/api/wallpaper/delete', {method:'POST', body:JSON.stringify({})});
    await applyWallpaper();  // refreshes div to inactive state
    showToast(t('wallpaper_removed'));
  }catch(e){
    showToast(t('failed_colon') + e.message);
  }
}

function setBrightness(percent){
  // Slider is 10..150; CSS variable expects 0.1..1.5.
  const decimal = Math.max(0.1, Math.min(1.5, percent / 100));
  document.documentElement.style.setProperty('--wallpaper-brightness', String(decimal));
}
