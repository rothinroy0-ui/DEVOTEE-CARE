/**
 * ISKCON Durgapur - DEVOTEE CARE
 * Core Application Engine & Data Store
 */

// Storage Keys
const STORAGE_KEYS = {
  DEVOTEES: 'iskcon_devotee_care_devotees',
  COUNSELORS: 'iskcon_devotee_care_counselors',
  DONORS: 'iskcon_devotee_care_donors',
  PARCELS: 'iskcon_devotee_care_parcels',
  ANNIV_REMOVED: 'iskcon_devotee_care_anniv_removed_v1',
  BDAY_REMOVED: 'iskcon_devotee_care_bday_removed_v1',
  INITIALIZED: 'iskcon_devotee_care_initialized_v1',
  PARCEL_PURGED: 'iskcon_devotee_care_parcels_purged_v3',
  ACTIVITY: 'iskcon_devotee_care_activity_v1',
  DELETED_PARCELS: 'iskcon_deleted_parcel_ids_v1',
  DELETED_DEVOTEES: 'iskcon_deleted_devotee_ids_v1'
};

// 🛡️ PERSISTENT TOMBSTONE ENGINE:
// Prevents deleted parcels and devotees from ever resurrecting via cloud sync or master data
function getDeletedParcelIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_PARCELS);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

function markParcelsAsDeleted(parcelIds) {
  if (!parcelIds) return;
  const ids = Array.isArray(parcelIds) ? parcelIds : [parcelIds];
  const set = getDeletedParcelIds();
  ids.forEach(id => { if (id) set.add(String(id)); });
  try {
    localStorage.setItem(STORAGE_KEYS.DELETED_PARCELS, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function getDeletedDevoteeIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_DEVOTEES);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

function markDevoteesAsDeleted(devoteeIds) {
  if (!devoteeIds) return;
  const ids = Array.isArray(devoteeIds) ? devoteeIds : [devoteeIds];
  const set = getDeletedDevoteeIds();
  ids.forEach(id => { if (id) set.add(String(id)); });
  try {
    localStorage.setItem(STORAGE_KEYS.DELETED_DEVOTEES, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

// Global State
let state = {
  devotees: [],
  counselors: [],
  donors: [],
  parcels: [],
  currentTab: 'dashboard',
  selectedBloodGroup: 'ALL',
  bdayTimeframe: 'all',
  celebrationEventType: 'ALL',
  charts: {},
  currentPage: 1,
  itemsPerPage: 50,
  selectedDevotees: new Set(),
  selectedCelebrations: new Set(),
  selectedParcels: new Set(),
  devoteeAgeGroup: null, // '0-25' | '26-50' | '51-60' | '60+' — set when an Age card is clicked
  anniversaryRemovedIds: [],   // Anniversary soft-removal: records are never deleted, always restorable
  birthdayRemovedIds: [],      // Birthday soft-removal (same rule as Anniversary — records are never deleted)
  activityLog: []              // 🧾 Audit history: who changed what & when (newest first)
};

// Reference current date for real-time calculations
const todayDate = new Date();
const currentMonth = todayDate.getMonth(); // 0-indexed
const currentDay = todayDate.getDate();

// Sri Sri Radha Madan Mohan image used in Greeting Cards (SVG illustration bundled with the app).
// To use your own photo instead, place a file next to index.html and change this to its name, e.g. 'radha-madan-mohan.jpg'.
const RADHA_MADAN_MOHAN_IMG = 'radha-madan-mohan.svg';

// Helper to format ISO date to DD MMM YYYY
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Calculate age from DOB
function calculateAge(dobStr) {
  if (!dobStr) return 'N/A';
  const birthDate = new Date(dobStr);
  let age = todayDate.getFullYear() - birthDate.getFullYear();
  const m = todayDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && todayDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str || str === 'NA' || str === 'No' || str === 'None') return null;

  // Check standard YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const yr = parseInt(ymdMatch[1]);
    const mo = parseInt(ymdMatch[2]) - 1;
    const dy = parseInt(ymdMatch[3]);
    return { year: yr, month: mo, day: dy };
  }

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmyMatch) {
    const dy = parseInt(dmyMatch[1]);
    const mo = parseInt(dmyMatch[2]) - 1;
    let yr = parseInt(dmyMatch[3]);
    if (yr < 100) yr += 1900;
    return { year: yr, month: mo, day: dy };
  }

  // Month names like 6-Jun-0002 or 14-Feb-1090 or 1 March, 1779
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (let i = 0; i < months.length; i++) {
    if (str.toLowerCase().includes(months[i])) {
      const numbers = str.match(/\d+/g);
      if (numbers && numbers.length >= 1) {
        const dy = parseInt(numbers[0]);
        const yr = numbers.length >= 2 ? parseInt(numbers[numbers.length - 1]) : todayDate.getFullYear();
        return { year: yr, month: i, day: dy };
      }
    }
  }

  // Fallback to Date.parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  }

  return null;
}

// Safely format any date value into an HTML <input type="date"> value (YYYY-MM-DD)
function toIsoDateInput(dateVal) {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  if (['na', 'n/a', 'no', 'none', 'null', '-'].includes(str.toLowerCase())) return '';
  const parts = parseDateParts(str);
  if (!parts) return '';
  const y = parts.year ? String(parts.year).padStart(4, '0') : '1990';
  const m = String(parts.month + 1).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Calculate years from any date string
function calculateYearsPassed(dateStr) {
  const parts = parseDateParts(dateStr);
  if (!parts || !parts.year || parts.year < 1900 || parts.year > todayDate.getFullYear()) return 0;
  let yrs = todayDate.getFullYear() - parts.year;
  const m = todayDate.getMonth() - parts.month;
  if (m < 0 || (m === 0 && todayDate.getDate() < parts.day)) {
    yrs--;
  }
  return Math.max(0, yrs);
}

// Check if a date string falls on today, tomorrow, this week, or this month
function checkEventTiming(dateStr) {
  const parts = parseDateParts(dateStr);
  if (!parts) return { isToday: false, isTomorrow: false, isThisWeek: false, isThisMonth: false, daysRemaining: null, parts: null };
  const m = parts.month;
  const day = parts.day;

  const isThisMonth = (m === currentMonth);
  const isToday = (m === currentMonth && day === currentDay);
  const isTomorrow = (m === currentMonth && day === currentDay + 1);

  let nextOccurrence = new Date(todayDate.getFullYear(), m, day);
  const todayOnly = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  if (nextOccurrence < todayOnly) {
    nextOccurrence = new Date(todayDate.getFullYear() + 1, m, day);
  }
  const diffTime = nextOccurrence - todayOnly;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isThisWeek = diffDays >= 0 && diffDays <= 7;

  return { isToday, isTomorrow, isThisWeek, isThisMonth, daysRemaining: diffDays, nextDate: nextOccurrence, parts };
}

// ----------------------------------------------------
// DEVOTEE PHOTO & AVATAR HELPERS (GOOGLE DRIVE & CUSTOM)
// ----------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Pattern 1: id=XXXX
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];

  // Pattern 2: /file/d/XXXX or /d/XXXX
  const dMatch = trimmed.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];

  // Pattern 3: open?id=XXXX
  const openMatch = trimmed.match(/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch && openMatch[1]) return openMatch[1];

  // Pattern 4: Bare ID (if 25+ chars of valid base64url)
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) {
    return trimmed;
  }

  return '';
}

function getDirectPhotoUrl(rawUrl, devotee = null) {
  let url = rawUrl;
  if (!url && devotee) {
    url = devotee.photo || devotee.photoDirect || devotee.cloudinaryPhoto || devotee.avatar || '';
  }
  if (!url || typeof url !== 'string') return '';
  url = url.trim();
  if (!url || url.toLowerCase() === 'n/a' || url.toLowerCase() === 'null' || url.toLowerCase() === 'undefined') return '';

  const driveId = extractGoogleDriveFileId(url);
  if (driveId) {
    // High-resolution direct streaming endpoint via Google lh3 CDN
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
    return url;
  }

  return '';
}

function getDevoteeInitials(name) {
  if (!name || typeof name !== 'string') return 'D';
  const clean = name.replace(/[\(\)\[\],.\-\/]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(w => w.length > 0 && !/^(hg|dr|mr|mrs|ms|sri|smt)$/i.test(w));
  if (words.length === 0) return 'D';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ----------------------------------------------------
// DEVOTEE CIRCULAR PHOTO PREVIEW & AVATAR INTERACTIONS
// ----------------------------------------------------
let avatarClickTimer = null;
let avatarClickDevoteeId = null;

window.handleDevoteeAvatarClick = function(e, devoteeId) {
  if (e) {
    e.stopPropagation();
  }
  if (!devoteeId) return;

  // Double click detection within 280ms on the same devotee
  if (avatarClickTimer && avatarClickDevoteeId === devoteeId) {
    clearTimeout(avatarClickTimer);
    avatarClickTimer = null;
    avatarClickDevoteeId = null;
    hideDevoteeHoverCardNow();
    openCircularPhotoPreview(devoteeId);
    return;
  }

  if (avatarClickTimer) {
    clearTimeout(avatarClickTimer);
    avatarClickTimer = null;
  }

  avatarClickDevoteeId = devoteeId;
  avatarClickTimer = setTimeout(() => {
    avatarClickTimer = null;
    avatarClickDevoteeId = null;
    viewDevoteeProfile(devoteeId);
  }, 260);
};

window.handleDevoteeAvatarDblClick = function(e, devoteeId) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (!devoteeId) return;

  if (avatarClickTimer) {
    clearTimeout(avatarClickTimer);
    avatarClickTimer = null;
    avatarClickDevoteeId = null;
  }
  hideDevoteeHoverCardNow();
  openCircularPhotoPreview(devoteeId);
};

window.openCircularPhotoPreview = function(devoteeId) {
  if (!devoteeId) return;
  const d = (state.devotees || []).find(x => x.id === devoteeId);
  if (!d) return;

  hideDevoteeHoverCardNow();

  const modal = document.getElementById('circular-photo-preview-modal');
  const content = document.getElementById('circular-photo-preview-content');
  const imageBox = document.getElementById('circular-preview-image-box');
  const infoBox = document.getElementById('circular-preview-info');
  if (!modal || !content || !imageBox || !infoBox) return;

  const displayName = d.spiritualName || d.legalName || 'Devotee';
  const secondaryName = (d.spiritualName && d.legalName && d.legalName !== d.spiritualName) ? d.legalName : '';
  const isFemale = (d.gender || '').toLowerCase() === 'female';
  const rawPhoto = d.photo || d.photoDirect || d.cloudinaryPhoto || '';
  const photoUrl = getDirectPhotoUrl(rawPhoto, d);
  const driveId = extractGoogleDriveFileId(rawPhoto || photoUrl);
  const highResUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w800` : (photoUrl || d.cloudinaryPhoto || '');
  const fallbackUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w300` : (d.cloudinaryPhoto || photoUrl || '');
  const initials = getDevoteeInitials(displayName);

  // Render Image Box: Medium circular preview (w-56 h-56 on mobile, w-64 h-64 / w-72 h-72 on larger screens)
  if (highResUrl || photoUrl) {
    const activeUrl = highResUrl || photoUrl;
    imageBox.innerHTML = `
      <div class="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full p-1.5 bg-gradient-to-tr ${isFemale ? 'from-rose-400 via-purple-400 to-amber-300' : 'from-teal-400 via-sky-400 to-indigo-400'} shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
        <div class="w-full h-full rounded-full overflow-hidden bg-slate-900 border-4 border-white/95 relative shadow-inner">
          <img 
            src="${activeUrl}" 
            alt="${escapeHtml(displayName)}"
            referrerpolicy="no-referrer"
            class="w-full h-full object-cover object-center select-none"
            data-fallback="${fallbackUrl}"
            onerror="if(this.dataset.fallback && this.src !== this.dataset.fallback){ this.src = this.dataset.fallback; } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }"
          />
          <div style="display:none;" class="w-full h-full items-center justify-center font-black text-white text-5xl bg-gradient-to-tr ${isFemale ? 'from-rose-500 to-purple-600' : 'from-teal-600 to-indigo-600'}">
            ${initials}
          </div>
        </div>
      </div>
    `;
  } else {
    imageBox.innerHTML = `
      <div class="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full p-1.5 bg-gradient-to-tr ${isFemale ? 'from-rose-400 via-purple-400 to-amber-300' : 'from-teal-400 via-sky-400 to-indigo-400'} shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
        <div class="w-full h-full rounded-full overflow-hidden bg-gradient-to-tr ${isFemale ? 'from-rose-500 to-purple-600' : 'from-teal-600 to-indigo-600'} border-4 border-white/95 flex items-center justify-center shadow-inner">
          <span class="font-black text-white text-5xl select-none tracking-wider">${initials}</span>
        </div>
      </div>
    `;
  }

  // Render Info Box under image
  infoBox.innerHTML = `
    <h3 class="text-xl sm:text-2xl font-bold text-white tracking-wide drop-shadow-md truncate max-w-sm" title="${escapeHtml(displayName)}">
      ${escapeHtml(displayName)}
    </h3>
    ${secondaryName ? `
      <p class="text-xs sm:text-sm text-slate-300 font-medium mt-0.5 truncate max-w-sm">
        Legal Name: ${escapeHtml(secondaryName)}
      </p>
    ` : ''}
    <div class="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-white/15 text-purple-200 border border-purple-300/30">
        ID: ${escapeHtml(d.id || 'N/A')}
      </span>
      ${d.phone ? `
        <a href="tel:${d.phone}" class="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/30 transition">
          <span>📞 ${escapeHtml(d.phone)}</span>
        </a>
      ` : ''}
    </div>
    <div class="mt-4 flex items-center justify-center gap-2">
      <button type="button" onclick="closeCircularPhotoPreview(); viewDevoteeProfile('${d.id}')" 
              class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/25 transition shadow-sm hover:scale-105 transform cursor-pointer">
        <i data-lucide="user" class="w-3.5 h-3.5"></i>
        <span>View Full Profile</span>
      </button>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  requestAnimationFrame(() => {
    content.classList.remove('scale-90', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  });

  if (window.lucide) lucide.createIcons();
};

window.closeCircularPhotoPreview = function() {
  const modal = document.getElementById('circular-photo-preview-modal');
  const content = document.getElementById('circular-photo-preview-content');
  if (!modal || !content) return;

  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-90', 'opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 180);
};

window.handleCircularPreviewBackdropClick = function(e) {
  if (e && e.target && e.target.id === 'circular-photo-preview-modal') {
    closeCircularPhotoPreview();
  }
};

// Global escape key handler for circular photo preview
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('circular-photo-preview-modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeCircularPhotoPreview();
    }
  }
});

function getCleanDefaultAvatarHtml(displayName, gender, sizeClass = 'w-10 h-10', textClass = 'text-xs', devoteeId = '', enableHover = true) {
  const initials = getDevoteeInitials(displayName);
  const isFemale = (gender || '').toLowerCase() === 'female';
  const bgGradient = isFemale 
    ? 'from-rose-500 to-purple-600 text-white border-rose-200' 
    : 'from-teal-600 to-indigo-600 text-white border-teal-200';
  const safeName = escapeHtml(displayName);
  const clickHandler = devoteeId 
    ? `onclick="handleDevoteeAvatarClick(event, '${devoteeId}')" ondblclick="handleDevoteeAvatarDblClick(event, '${devoteeId}')"` 
    : '';
  const hoverHandlers = (devoteeId && enableHover) 
    ? `onmouseenter="showDevoteeHoverCard(event, '${devoteeId}')" onmouseleave="scheduleHideDevoteeHoverCard()"` 
    : '';

  return `
    <div class="group/avatar relative ${sizeClass} flex-shrink-0 cursor-pointer select-none" ${clickHandler} ${hoverHandlers} title="Click to view profile, Double-click to enlarge photo">
      <div class="${sizeClass} rounded-full bg-gradient-to-tr ${bgGradient} border flex items-center justify-center font-bold ${textClass} shadow-sm select-none tracking-wider transition-all duration-300 ease-out transform group-hover/avatar:scale-115 group-hover/avatar:shadow-md group-hover/avatar:ring-2 group-hover/avatar:ring-teal-400">
        <span>${initials}</span>
      </div>
    </div>
  `;
}

function getDevoteeAvatarHtml(d, sizeClass = 'w-10 h-10', textClass = 'text-xs', enableHover = true) {
  if (!d) return getCleanDefaultAvatarHtml('Devotee', 'Male', sizeClass, textClass);
  const displayName = d.spiritualName || d.legalName || 'Devotee';
  const photoUrl = getDirectPhotoUrl(d.photo || d.photoDirect || d.cloudinaryPhoto, d);

  if (photoUrl) {
    const isFemale = (d.gender || '').toLowerCase() === 'female';
    const borderColor = isFemale ? 'border-rose-200 group-hover/avatar:border-rose-400' : 'border-teal-200 group-hover/avatar:border-teal-400';
    const driveId = extractGoogleDriveFileId(d.photo || d.photoDirect || photoUrl);
    const fallbackUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w200` : (d.cloudinaryPhoto || '');
    const safeName = escapeHtml(displayName);
    const safeGender = escapeHtml(d.gender || 'Male');
    const hoverHandlers = (d.id && enableHover) 
      ? `onmouseenter="showDevoteeHoverCard(event, '${d.id}')" onmouseleave="scheduleHideDevoteeHoverCard()"` 
      : '';

    return `
      <div class="group/avatar relative ${sizeClass} flex-shrink-0 cursor-pointer select-none" 
           onclick="handleDevoteeAvatarClick(event, '${d.id}')" 
           ondblclick="handleDevoteeAvatarDblClick(event, '${d.id}')" 
           ${hoverHandlers} 
           title="Click to view profile, Double-click to enlarge photo">
        <img 
          src="${photoUrl}" 
          alt="${safeName}" 
          loading="lazy" 
          referrerpolicy="no-referrer"
          class="${sizeClass} rounded-full object-cover border-2 ${borderColor} shadow-sm transition-all duration-300 ease-out transform group-hover/avatar:scale-115 group-hover/avatar:shadow-md group-hover/avatar:ring-2 group-hover/avatar:ring-teal-400" 
          data-fallback="${fallbackUrl}"
          onerror="handleAvatarError(this, '${safeName}', '${safeGender}')"
        />
      </div>
    `;
  }

  return getCleanDefaultAvatarHtml(displayName, d.gender, sizeClass, textClass, d.id, enableHover);
}

window.handleAvatarError = function(imgEl, displayName, gender) {
  if (!imgEl) return;
  // If fallback URL available and not tried yet, switch src to fallback
  const fallback = imgEl.getAttribute('data-fallback');
  if (fallback && fallback !== imgEl.src && !imgEl.dataset.triedFallback) {
    imgEl.dataset.triedFallback = 'true';
    imgEl.src = fallback;
    return;
  }

  // Replace image with clean default avatar
  const isFemale = (gender || '').toLowerCase() === 'female';
  const initials = getDevoteeInitials(displayName);
  const bgGradient = isFemale 
    ? 'bg-gradient-to-tr from-rose-500 to-purple-600 text-white border-rose-200' 
    : 'bg-gradient-to-tr from-teal-600 to-indigo-600 text-white border-teal-200';

  const div = document.createElement('div');
  div.className = `${imgEl.className.replace(/border-2\s+\S+/g, '').replace(/object-\w+/g, '')} ${bgGradient} border flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0 select-none tracking-wider`;
  div.title = displayName;
  div.innerHTML = `<span>${initials}</span>`;

  if (imgEl.parentNode) {
    imgEl.parentNode.replaceChild(div, imgEl);
  } else {
    imgEl.outerHTML = div.outerHTML;
  }
};

// ----------------------------------------------------
// DEVOTEE MINI HOVER CARD CONTROLLER
// ----------------------------------------------------
let hoverCardHideTimeout = null;

function showDevoteeHoverCard(event, devoteeId) {
  clearTimeout(hoverCardHideTimeout);
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  const card = document.getElementById('devotee-hover-card');
  if (!card) return;

  const displayName = d.spiritualName || d.legalName || 'Devotee';
  const secondaryName = (d.spiritualName && d.legalName) ? d.legalName : '';
  const dobText = d.birthdayRaw || formatDate(d.dob);
  const age = calculateAge(d.dob);
  const phone = d.phone || 'N/A';
  const whatsapp = d.whatsapp || d.phone || 'N/A';
  const email = d.email || '';
  const photoUrl = getDirectPhotoUrl(d.photo || d.photoDirect || d.cloudinaryPhoto, d);

  card.innerHTML = `
    <div>
      <!-- Top: Avatar & Name & Devotee ID -->
      <div class="flex items-center space-x-3 pb-3 border-b border-slate-100">
        <div class="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 border-2 border-teal-200 shadow-xs bg-slate-100 flex items-center justify-center">
          ${photoUrl ? `
            <img src="${photoUrl}" alt="${escapeHtml(displayName)}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div style="display:none;" class="w-full h-full flex items-center justify-center font-bold text-teal-800 bg-teal-100 text-xs">
              ${getDevoteeInitials(displayName)}
            </div>
          ` : `
            <div class="w-full h-full flex items-center justify-center font-bold text-teal-800 bg-teal-100 text-xs">
              ${getDevoteeInitials(displayName)}
            </div>
          `}
        </div>
        <div class="overflow-hidden flex-1 min-w-0">
          <h4 class="font-bold text-slate-900 text-xs truncate" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h4>
          ${secondaryName ? `<p class="text-[11px] text-slate-500 truncate" title="${escapeHtml(secondaryName)}">${escapeHtml(secondaryName)}</p>` : ''}
          <div class="mt-1">
            <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              ID: ${d.id || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <!-- Basic Details -->
      <div class="pt-2.5">
        <div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5 flex items-center space-x-1">
          <i data-lucide="user" class="w-3 h-3 text-slate-400"></i>
          <span>Basic Details</span>
        </div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between items-center py-0.5">
            <span class="text-slate-500 text-[11px]">Name:</span>
            <span class="font-semibold text-slate-800 truncate ml-2 text-right max-w-[170px]" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-slate-500 text-[11px]">Date of Birth:</span>
            <span class="font-medium text-slate-800 flex items-center space-x-1">
              <span>🎂</span>
              <span>${dobText}</span>
              ${age > 0 ? `<span class="text-slate-400 text-[10px]">(${age}y)</span>` : ''}
            </span>
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-slate-500 text-[11px]">Devotee ID:</span>
            <span class="font-mono font-bold text-teal-700">${d.id || 'N/A'}</span>
          </div>
        </div>
      </div>

      <!-- Contact Details -->
      <div class="pt-2.5 mt-2 border-t border-slate-100">
        <div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5 flex items-center space-x-1">
          <i data-lucide="phone-call" class="w-3 h-3 text-slate-400"></i>
          <span>Contact Details</span>
        </div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between items-center py-0.5">
            <span class="text-slate-500 text-[11px]">Mobile Number:</span>
            ${d.phone ? `
              <a href="tel:${d.phone}" class="font-medium text-teal-700 hover:text-teal-800 flex items-center space-x-1 transition" title="Call ${d.phone}">
                <span>📞</span>
                <span>${d.phone}</span>
              </a>
            ` : `<span class="text-slate-400">N/A</span>`}
          </div>
          <div class="flex justify-between items-center py-0.5">
            <span class="text-slate-500 text-[11px]">WhatsApp:</span>
            ${whatsapp !== 'N/A' ? `
              <a href="https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}" target="_blank" class="font-medium text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 transition" title="Chat on WhatsApp">
                <span>💬</span>
                <span>${whatsapp}</span>
              </a>
            ` : `<span class="text-slate-400">N/A</span>`}
          </div>
          ${email ? `
          <div class="flex justify-between items-center py-0.5">
            <span class="text-slate-500 text-[11px]">Email:</span>
            <a href="mailto:${email}" class="font-medium text-indigo-600 hover:text-indigo-800 truncate ml-2 text-right max-w-[160px] transition" title="${email}">
              ${email}
            </a>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- View Full Details CTA -->
      <div class="pt-3 mt-2.5 border-t border-slate-100">
        <button onclick="hideDevoteeHoverCardNow(); viewDevoteeProfile('${d.id}');" class="w-full py-1.5 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-lg transition shadow-xs flex items-center justify-center space-x-1.5">
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          <span>View Full Details</span>
        </button>
      </div>
    </div>
  `;

  // Calculate position relative to trigger
  const rect = event.currentTarget.getBoundingClientRect();
  const cardWidth = 288;
  const cardHeight = 310;

  let left = rect.right + 12;
  let top = rect.top + (rect.height / 2) - 80;

  // If overflows right, show on left
  if (left + cardWidth > window.innerWidth - 12) {
    left = rect.left - cardWidth - 12;
  }
  if (left < 10) left = 10;
  if (top + cardHeight > window.innerHeight - 10) {
    top = window.innerHeight - cardHeight - 12;
  }
  if (top < 10) top = 10;

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;

  card.classList.remove('hidden');
  requestAnimationFrame(() => {
    card.classList.remove('opacity-0', 'scale-95');
    card.classList.add('opacity-100', 'scale-100');
  });

  if (window.lucide) lucide.createIcons();
}

function scheduleHideDevoteeHoverCard() {
  hoverCardHideTimeout = setTimeout(() => {
    hideDevoteeHoverCardNow();
  }, 220);
}

function cancelHideDevoteeHoverCard() {
  clearTimeout(hoverCardHideTimeout);
}

function hideDevoteeHoverCardNow() {
  clearTimeout(hoverCardHideTimeout);
  const card = document.getElementById('devotee-hover-card');
  if (!card) return;
  card.classList.remove('opacity-100', 'scale-100');
  card.classList.add('opacity-0', 'scale-95');
  setTimeout(() => {
    if (card.classList.contains('opacity-0')) {
      card.classList.add('hidden');
    }
  }, 200);
}

// ----------------------------------------------------
// INITIAL SAMPLE DATA
// ----------------------------------------------------
function getInitialSampleData() {
  const y = todayDate.getFullYear();
  const mStr = String(todayDate.getMonth() + 1).padStart(2, '0');
  const dStrToday = String(todayDate.getDate()).padStart(2, '0');
  const dStrTom = String(todayDate.getDate() + 1).padStart(2, '0');
  const dStrNextWk = String(Math.min(28, todayDate.getDate() + 4)).padStart(2, '0');

  const devotees = [
    {
      id: 'DEV-001',
      legalName: 'Gaurav Sharma',
      spiritualName: 'Gauranga Prema Dasa',
      gender: 'Male',
      dob: `1982-${mStr}-${dStrToday}`, // Birthday today!
      ashrama: 'Grihastha',
      maritalStatus: '',
      phone: '+91 98201 11223',
      whatsapp: '+91 98201 11223',
      email: 'gauranga.prema@iskcon.org',
      address: 'B-402, Sri Krishna Balaram Apts, Sector 4',
      city: 'Mumbai',
      emergencyName: 'Radha Priya Devi Dasi (Wife)',
      emergencyPhone: '+91 98201 11224',
      initiationStatus: 'Brahmana',
      guru: 'H.H. Radhanath Swami',
      initiationDate: '2008-04-14',
      brahmanaDate: '2014-11-04',
      initiationPlace: 'Sri Sri Radha Gopinath Mandir, Chowpatty',
      japaRounds: 16,
      degrees: ['Bhakti Shastri', 'Bhakti Vaibhava'],
      bloodGroup: 'O+',
      isBloodDonor: 'Yes',
      insurance: 'Star Health Family Care (Sum: ₹10 Lakhs)',
      medicalConditions: 'Mild hypertension managed with lifestyle and medication',
      medications: 'Telmisartan 20mg morning. Strict sattvic prasadam diet',
      counselor: 'H.G. Gauranga Dasa',
      counselorGroup: 'Chaitanya Mahaprabhu Sangha',
      currentSeva: 'Sunday School Mentorship & Congregation Care',
      profession: 'Senior IT Consultant',
      notes: 'Active in counselor care. Dedicated coordinator for devotee medical checkups.'
    },
    {
      id: 'DEV-002',
      legalName: 'Yashwant Patil',
      spiritualName: 'Yasodanandana Dasa',
      gender: 'Male',
      dob: `1949-${mStr}-${dStrTom}`, // Birthday tomorrow! Senior Vaishnava (77 yrs)
      ashrama: 'Vanaprastha',
      maritalStatus: '',
      phone: '+91 94341 55667',
      whatsapp: '+91 94341 55667',
      email: 'yasodanandana@mayapur.com',
      address: 'Gada Bhavan Room 104, ISKCON Campus',
      city: 'Sridham Mayapur',
      emergencyName: 'Govinda Dasa (Brahmachari Caretaker)',
      emergencyPhone: '+91 94341 99881',
      initiationStatus: 'Brahmana',
      guru: 'A.C. Bhaktivedanta Swami Prabhupada',
      initiationDate: '1974-03-08',
      brahmanaDate: '1976-08-20',
      initiationPlace: 'ISKCON Mayapur Chandrodaya Mandir',
      japaRounds: 25,
      degrees: ['Bhakti Shastri', 'Bhakti Vaibhava', 'Bhakti Vedanta'],
      bloodGroup: 'B+',
      isBloodDonor: 'No',
      insurance: 'ISKCON Mayapur Vaishnava Seva Medical Trust',
      medicalConditions: 'Senior devotee care: Type 2 Diabetes, Knee osteoarthritis requiring walking assistance',
      medications: 'Metformin 500mg, Calcium + Vit D supplements, Glucosamine',
      counselor: 'H.H. Jayapataka Swami',
      counselorGroup: 'Senior Vaishnava Council',
      currentSeva: 'Srimad Bhagavatam Sastra Teaching & Japa Mentorship',
      profession: 'Lifelong Dedicated Missionary / Author',
      notes: 'Requires daily wheelchair support during temple parikrama and noon prasadam delivery.'
    },
    {
      id: 'DEV-003',
      legalName: 'Amit Verma',
      spiritualName: 'Madhava Kripa Dasa',
      gender: 'Male',
      dob: `1997-${mStr}-${dStrNextWk}`, // Upcoming in a few days
      ashrama: 'Brahmachari',
      maritalStatus: '',
      phone: '+91 97654 32109',
      whatsapp: '+91 97654 32109',
      email: 'madhava.kripa@iskconpune.in',
      address: 'Brahmachari Ashram, NVCC Katraj-Kondhwa',
      city: 'Pune',
      emergencyName: 'H.G. Radheshyam Dasa (Temple President)',
      emergencyPhone: '+91 98220 54321',
      initiationStatus: 'Harinama',
      guru: 'H.H. Gopal Krishna Goswami',
      initiationDate: '2021-08-30',
      brahmanaDate: '',
      initiationPlace: 'ISKCON Pune NVCC',
      japaRounds: 16,
      degrees: ['Bhakti Shastri'],
      bloodGroup: 'O+',
      isBloodDonor: 'Yes',
      insurance: 'Ayushman Bharat / Ashram Group Mediclaim',
      medicalConditions: 'Recovering from right knee ligament sprain during book marathon',
      medications: 'Physiotherapy exercises twice daily',
      counselor: 'H.G. Radheshyam Dasa',
      counselorGroup: 'Nityananda Youth Sangha',
      currentSeva: 'Youth Preaching / VOICE College Preaching Cell',
      profession: 'Full-time Monk / B.Tech Computer Science',
      notes: 'Dynamic youth preacher. Very helpful blood donor volunteer.'
    },
    {
      id: 'DEV-004',
      legalName: 'Sunita Mehra',
      spiritualName: 'Kuntidevi Devi Dasi',
      gender: 'Female',
      dob: `1965-02-14`,
      ashrama: 'Grihastha',
      maritalStatus: '',
      phone: '+91 98112 34567',
      whatsapp: '+91 98112 34567',
      email: 'kuntidevi.dasi@gmail.com',
      address: 'Flat 12, Vrinda Heritage, Raman Reti',
      city: 'Sri Vrindavan',
      emergencyName: 'Kishore Dasa (Husband)',
      emergencyPhone: '+91 98112 34568',
      initiationStatus: 'Brahmana',
      guru: 'H.H. Lokanath Swami',
      initiationDate: '1995-11-12',
      brahmanaDate: '2001-03-24',
      initiationPlace: 'ISKCON Krishna Balaram Mandir, Vrindavan',
      japaRounds: 16,
      degrees: ['Bhakti Shastri'],
      bloodGroup: 'A+',
      isBloodDonor: 'Yes',
      insurance: 'HDFC Ergo Health Suraksha',
      medicalConditions: 'Occasional migraine, otherwise healthy',
      medications: 'Ayurvedic Rasayanas and Triphala',
      counselor: 'H.H. Lokanath Swami',
      counselorGroup: 'Radharani Mataji Sangha',
      currentSeva: 'Deity Garland & Dress Seva for Krishna Balaram',
      profession: 'Educator & Vaishnava Counselor',
      notes: 'Leads Mataji counseling cell and organizes hospital prasadam distribution.'
    },
    {
      id: 'DEV-005',
      legalName: 'Praveen Nair',
      spiritualName: 'Paramananda Dasa',
      gender: 'Male',
      dob: `1958-${mStr}-12`,
      ashrama: 'Sannyasi',
      maritalStatus: '',
      phone: '+91 94471 22334',
      whatsapp: '+91 94471 22334',
      email: 'paramananda.swami@iskcon.org',
      address: 'Sannyasa Ashram, ISKCON Mayapur',
      city: 'Sridham Mayapur',
      emergencyName: 'Mukunda Sevaka Dasa (Sannyasa Assistant)',
      emergencyPhone: '+91 94471 22335',
      initiationStatus: 'Sannyasa',
      guru: 'H.H. Jayapataka Swami',
      initiationDate: '1985-05-18',
      brahmanaDate: '1988-10-15',
      initiationPlace: 'Sri Jagannatha Puri Dhama',
      japaRounds: 32,
      degrees: ['Bhakti Shastri', 'Bhakti Vaibhava', 'Bhakti Vedanta', 'Bhakti Sarvabhauma'],
      bloodGroup: 'AB+',
      isBloodDonor: 'No',
      insurance: 'Global Vaishnava Health Coverage',
      medicalConditions: 'Post-cardiac stent placement, strictly low-sodium prasadam',
      medications: 'Cardiologist prescribed blood thinners and BP management',
      counselor: 'GBC Devotee Care Committee',
      counselorGroup: 'Senior Vaishnava Council',
      currentSeva: 'Preaching Tours, Sannyasa Guidance & Guru Parampara Seva',
      profession: 'Sannyasi & Traveling Preacher',
      notes: 'Special care needed during travel: wheel-chair assistance at airports/railways.'
    },
    {
      id: 'DEV-006',
      legalName: 'Dr. Acyuta Rao',
      spiritualName: 'Acyuta Krishna Dasa',
      gender: 'Male',
      dob: `1985-08-22`,
      ashrama: 'Grihastha',
      maritalStatus: '',
      phone: '+91 98480 88990',
      whatsapp: '+91 98480 88990',
      email: 'dr.acyuta@bhaktivedanta-hospital.org',
      address: 'Apartment 7B, Tulasi Gardens',
      city: 'Mira Road, Thane / Mumbai',
      emergencyName: 'Laxmi Devi Dasi (Spouse)',
      emergencyPhone: '+91 98480 88991',
      initiationStatus: 'Brahmana',
      guru: 'H.H. Radhanath Swami',
      initiationDate: '2012-01-20',
      brahmanaDate: '2016-09-10',
      initiationPlace: 'Bhakti Kala Kshetra, Mumbai',
      japaRounds: 16,
      degrees: ['Bhakti Shastri'],
      bloodGroup: 'O-',
      isBloodDonor: 'Yes',
      insurance: 'Max Bupa Health Companion',
      medicalConditions: 'None. Fit and active.',
      medications: 'None',
      counselor: 'H.G. Braja Mohan Dasa',
      counselorGroup: 'Chaitanya Mahaprabhu Sangha',
      currentSeva: 'Medical Cell Coordinator & Bhaktivedanta Hospital Devotee Care Clinic',
      profession: 'Consultant Physician / MD Internal Medicine',
      notes: 'Key medical resource doctor for critical devotee care triage.'
    },
    {
      id: 'DEV-007',
      legalName: 'Deepak Agarwal',
      spiritualName: 'Damodara Dasa',
      gender: 'Male',
      dob: `1979-${mStr}-25`,
      ashrama: 'Grihastha',
      maritalStatus: 'Married',
      phone: '+91 93120 44556',
      whatsapp: '+91 93120 44556',
      email: 'damodara.delhi@gmail.com',
      address: 'C-34, East of Kailash',
      city: 'New Delhi',
      emergencyName: 'Radha Sundari Devi Dasi (Wife)',
      emergencyPhone: '+91 93120 44557',
      initiationStatus: 'Harinama',
      guru: 'H.H. Gopal Krishna Goswami',
      initiationDate: '2015-11-20',
      brahmanaDate: '',
      initiationPlace: 'ISKCON Glory of India Temple, Delhi',
      japaRounds: 16,
      degrees: ['Bhakti Shastri'],
      bloodGroup: 'B-',
      isBloodDonor: 'Yes',
      insurance: 'Religare Health Insurance',
      medicalConditions: 'Chronic Lumbar spondylosis',
      medications: 'Ayurvedic spine oil therapies and gentle asanas',
      counselor: 'H.G. Mohan Rupa Dasa',
      counselorGroup: 'Govinda Bhakti Sangha',
      currentSeva: 'Congregation Life Patron Care & Book Storage Seva',
      profession: 'Businessman (Eco-friendly packaging)',
      notes: 'Helps organize winter blanket and prasadam distribution to sadhus.'
    },
    {
      id: 'DEV-008',
      legalName: 'Priya Sengupta',
      spiritualName: 'Padmavati Devi Dasi',
      gender: 'Female',
      dob: `1992-${mStr}-18`,
      ashrama: 'Grihastha',
      maritalStatus: 'Married',
      phone: '+91 98300 77889',
      whatsapp: '+91 98300 77889',
      email: 'padmavati.kolkata@gmail.com',
      address: '22/A Albert Road',
      city: 'Kolkata',
      emergencyName: 'Nimai Dasa (Husband)',
      emergencyPhone: '+91 98300 77888',
      initiationStatus: 'Harinama',
      guru: 'H.H. Jayapataka Swami',
      initiationDate: '2018-03-20',
      brahmanaDate: '',
      initiationPlace: 'Sri Sri Radha Govinda Mandir, Kolkata',
      japaRounds: 16,
      degrees: ['Bhakti Shastri'],
      bloodGroup: 'A-',
      isBloodDonor: 'Yes',
      insurance: 'Care Health Insurance',
      medicalConditions: 'None',
      medications: 'Prenatal vitamins',
      counselor: 'H.G. Achyuta Prem Dasa',
      counselorGroup: 'Radharani Mataji Sangha',
      currentSeva: 'Sunday Feast Kitchen Seva & Tulasi Garden Care',
      profession: 'Graphic Designer',
      notes: 'Volunteers for design work in Devotee Care publications.'
    }
  ];

  const counselors = [
    {
      id: 'CS-01',
      name: 'H.G. Gauranga Dasa',
      groupName: 'Chaitanya Mahaprabhu Sangha',
      membersCount: 24,
      meetingFrequency: 'Weekly (Every Sunday 8:00 AM)',
      focusArea: 'Grihastha Harmony, Devotional Sadhana & Family Care',
      contact: '+91 98200 12345',
      email: 'gauranga.das@iskcon.gov'
    },
    {
      id: 'CS-02',
      name: 'H.G. Radheshyam Dasa',
      groupName: 'Nityananda Youth Sangha',
      membersCount: 38,
      meetingFrequency: 'Bi-weekly (Tuesdays & Saturdays)',
      focusArea: 'Brahmachari Training, Sastric Studies & Youth Guidance',
      contact: '+91 98220 54321',
      email: 'radheshyam@iskconpune.in'
    },
    {
      id: 'CS-03',
      name: 'H.G. Kuntidevi Devi Dasi',
      groupName: 'Radharani Mataji Sangha',
      membersCount: 19,
      meetingFrequency: 'Weekly (Every Wednesday 5:00 PM)',
      focusArea: 'Mataji Counseling, Emotional Well-being & Prasadam Seva',
      contact: '+91 98112 34567',
      email: 'kuntidevi.dasi@gmail.com'
    },
    {
      id: 'CS-04',
      name: 'H.G. Mohan Rupa Dasa',
      groupName: 'Govinda Bhakti Sangha',
      membersCount: 22,
      meetingFrequency: 'Weekly (Saturday 6:30 PM)',
      focusArea: 'Delhi Congregation Pastoral Care & Health Outreach',
      contact: '+91 93120 99887',
      email: 'mohanrupa@iskcondelhi.com'
    }
  ];

  return { devotees, counselors };
}

// ----------------------------------------------------
// PERSISTENCE & INITIALIZATION
// ----------------------------------------------------
// ----------------------------------------------------
// MONTH FILTERS — fresh dynamic month options
// ----------------------------------------------------
function populateMonthFilters() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const curMonthNum = currentMonth + 1; // 1-12
  const curName = monthNames[currentMonth];

  // Birthday/Anniversary Month View — clean options only:
  //   1. All Months   (default — full-year view)
  //   2-13. January → December (always in calendar sequence, no extras)
  const bdaySel = document.getElementById('bday-select-month');
  if (bdaySel) {
    let html = '<option value="ALL" selected>All Months</option>';
    monthNames.forEach((m, i) => { html += `<option value="${i + 1}">${m}</option>`; });
    bdaySel.innerHTML = html;
  }

  // Directory filter: All Months default, with a This Month shortcut
  const dirSel = document.getElementById('filter-month');
  if (dirSel) {
    let html = '<option value="" selected>All Months</option>';
    html += `<option value="${curMonthNum}">🌸 This Month · ${curName}</option>`;
    monthNames.forEach((m, i) => {
      if (i === currentMonth) return;
      html += `<option value="${i + 1}">${m}</option>`;
    });
    dirSel.innerHTML = html;
  }
}

// ==========================================
// SUPABASE CLIENT INTEGRATION (READ ACCESS)
// ==========================================
let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const url = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || (window.ENV && window.ENV.SUPABASE_URL);
  const anonKey = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || (window.ENV && window.ENV.SUPABASE_ANON_KEY);
  if (window.supabase && typeof window.supabase.createClient === 'function' && url && anonKey) {
    try {
      supabaseClient = window.supabase.createClient(url, anonKey);
      console.log('✅ Supabase client initialized with Project URL:', url);
      return supabaseClient;
    } catch (e) {
      console.error('❌ Supabase client initialization error:', e);
    }
  } else {
    console.warn('⚠️ Supabase JS SDK or credentials not loaded.');
  }
  return null;
}

function mapSupabaseRowToDevotee(row, existingDevotee = {}) {
  const bRaw = row['BIRTHDAY'] || row['birthday'] || existingDevotee.birthdayRaw || '';
  const aRaw = row['ANNIVERSARY'] || row['anniversary'] || existingDevotee.anniversaryRaw || '';
  
  const bParts = parseDateParts(bRaw);
  const aParts = parseDateParts(aRaw);

  const devoteeId = (row['DEVOTEE ID'] || row['devotee_id'] || existingDevotee.id || '').trim();
  const photo = row['PHOTO'] || row['photo'] || existingDevotee.photo || '';
  const directPhoto = existingDevotee.photoDirect || (photo.includes('drive.google.com') ? photo.replace('/open?id=', '/thumbnail?id=') : photo);

  return {
    ...existingDevotee,
    slNo: row['SL NO'] !== undefined ? row['SL NO'] : (existingDevotee.slNo || 0),
    id: devoteeId,
    legalName: (row['NAME'] || row['legalName'] || existingDevotee.legalName || '').trim(),
    spiritualName: (row['INITIATED NAME'] || row['spiritualName'] || existingDevotee.spiritualName || '').trim(),
    spouseName: (row['SPOUSE NAME'] || row['spouseName'] || existingDevotee.spouseName || '').trim(),
    birthdayRaw: bRaw,
    dob: bParts ? `${bParts.year}-${String(bParts.month + 1).padStart(2, '0')}-${String(bParts.day).padStart(2, '0')}` : (existingDevotee.dob || ''),
    bDay: bParts ? bParts.day : (existingDevotee.bDay || null),
    bMonth: bParts ? bParts.month + 1 : (existingDevotee.bMonth || null),
    bYear: bParts ? bParts.year : (existingDevotee.bYear || null),
    anniversaryRaw: aRaw,
    anniversaryDate: aParts ? `${aParts.year}-${String(aParts.month + 1).padStart(2, '0')}-${String(aParts.day).padStart(2, '0')}` : (existingDevotee.anniversaryDate || ''),
    aDay: aParts ? aParts.day : (existingDevotee.aDay || null),
    aMonth: aParts ? aParts.month + 1 : (existingDevotee.aMonth || null),
    aYear: aParts ? aParts.year : (existingDevotee.aYear || null),
    phone: String(row['CONTACT NO'] || row['phone'] || existingDevotee.phone || '').trim(),
    whatsapp: String(row['CONTACT NO'] || row['whatsapp'] || existingDevotee.whatsapp || '').trim(),
    address: row['ADDRESS'] || existingDevotee.address || '',
    city: row['CITY'] || existingDevotee.city || '',
    state: row['STATE'] || existingDevotee.state || '',
    pincode: row['PIN CODE'] || existingDevotee.pincode || '',
    photo: photo,
    photoDirect: directPhoto,
    maritalStatus: row['marital_status'] || row['maritalStatus'] || existingDevotee.maritalStatus || '',
    addressVerified: row['address_verified'] || row['addressVerified'] || existingDevotee.addressVerified || '',
    deliveryMode: row['delivery_mode'] || row['deliveryMode'] || existingDevotee.deliveryMode || '',
    courierPartner: row['courier_partner'] || row['courierPartner'] || existingDevotee.courierPartner || ''
  };
}

async function initSupabaseAndSync() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    console.log('🔄 Connecting to Supabase and fetching table "devotees"...');
    const { data, error } = await client
      .from('devotees')
      .select('*')
      .order('SL NO', { ascending: true });

    if (error) {
      console.error('❌ Supabase READ query failed:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log(`✅ Supabase READ successful! Retrieved ${data.length} records.`);

      // Create lookup maps for fast matching with existing devotees
      const mapById = new Map();
      const mapBySl = new Map();
      (state.devotees || []).forEach(d => {
        if (d.id) mapById.set(d.id, d);
        if (d.slNo) mapBySl.set(d.slNo, d);
      });

      const updatedDevotees = data.map(row => {
        const devId = (row['DEVOTEE ID'] || row['devotee_id'] || '').trim();
        const slNo = row['SL NO'];
        const existing = (devId && mapById.get(devId)) || (slNo && mapBySl.get(slNo)) || {};
        return mapSupabaseRowToDevotee(row, existing);
      });

      // Keep any devotees from master dataset not present in Supabase table (excluding deleted devotees)
      const syncedIds = new Set(updatedDevotees.map(d => d.id));
      const deletedDevIds = getDeletedDevoteeIds();
      (state.devotees || []).forEach(d => {
        if (d.id && !syncedIds.has(d.id) && !deletedDevIds.has(d.id)) {
          updatedDevotees.push(d);
        }
      });

      state.devotees = updatedDevotees.filter(d => !deletedDevIds.has(d.id));
      saveToStorage();

      // Refresh displays with live Supabase data
      updateKPIs();
      populateMonthFilters();
      populateCityFilter();
      renderDashboard();
      renderDevoteesTable();
      renderBirthdaysGrid();
      if (typeof initCharts === 'function') initCharts();
      if (window.lucide) lucide.createIcons();
    }

    // Bootstrap: when the cloud `devotees` table is empty, push the bundled
    // master list ONCE (per browser) so the live website has the full
    // directory (~824 rows). Non-fatal — skipped gracefully if RLS blocks it.
    if (data && data.length === 0 && !localStorage.getItem('cloud-devotees-attempted')) {
      localStorage.setItem('cloud-devotees-attempted', '1');
      await pushMasterDevoteesToSupabase();
    }

    // Also fetch cloud parcels, activity log & setup multi-user real-time sync
    await fetchParcelsFromSupabase();
    await loadActivityLogFromCloud();
    await loadStaffListFromCloud();
    if (isAdminOrSuper()) {
      await fetchDeleteRequests(false);
      subscribeToDeleteRequests();
    }
    setupRealtimeSync();

  } catch (err) {
    console.error('❌ Unexpected error fetching from Supabase:', err);
  }
}

// ======================================================================
// ☁️ MULTI-USER CLOUD SYNC & REALTIME DATABASE (SUPABASE)
// ======================================================================

function toSupabaseParcel(p) {
  return {
    id: p.id || `PARCEL-${p.devoteeId || 'DEV'}-${Date.now()}`,
    devotee_id: p.devoteeId || '',
    devotee_name: p.devoteeName || p.spiritualName || p.legalName || '',
    spiritual_name: p.spiritualName || '',
    legal_name: p.legalName || '',
    phone: p.phone || '',
    address: p.address || '',
    city: p.city || '',
    pincode: p.pincode || '',
    address_verified: p.addressVerified || '',
    status: p.status || p.parcelStatus || 'Packed',
    event_type: p.eventType || p.parcelType || '',
    courier_partner: p.courierPartner || '',
    courier_tracking_no: p.courierTrackingNo || '',
    tracking_id: p.trackingId || '',
    delivery_mode: p.deliveryMode || (p.courierPartner === 'Self Pickup' ? 'SELF' : (p.courierPartner ? 'DELHIVERY' : '')),
    pre_calling: p.preCalling || '',
    post_calling: p.postCalling || '',
    booking_date: p.bookingDate || '',
    dispatch_date: p.dispatchDate || '',
    delivery_date: p.deliveryDate || '',
    expected_delivery_date: p.expectedDeliveryDate || '',
    delivered: p.delivered === true,
    delivered_at: p.deliveredAt || '',
    remarks: p.remarks || p.parcelDescription || '',
    raw_data: p,
    updated_at: new Date().toISOString()
  };
}

function fromSupabaseParcel(row) {
  const cloudDeliveryMode = () => row.delivery_mode
    || (row.raw_data && row.raw_data.deliveryMode)
    || (row.courier_partner === 'Self Pickup' ? 'SELF' : (row.courier_partner ? 'DELHIVERY' : ''));
  if (row.raw_data && typeof row.raw_data === 'object') {
    return {
      ...row.raw_data,
      id: row.id,
      devoteeId: row.devotee_id,
      devoteeName: row.devotee_name,
      spiritualName: row.spiritual_name,
      legalName: row.legal_name,
      phone: row.phone,
      address: row.address,
      city: row.city,
      pincode: row.pincode,
      addressVerified: row.address_verified,
      status: row.status,
      parcelStatus: row.status,
      courierPartner: row.courier_partner,
      courierTrackingNo: row.courier_tracking_no,
      trackingId: row.tracking_id,
      deliveryMode: cloudDeliveryMode(),
      preCalling: row.pre_calling || (row.raw_data.preCalling) || '',
      postCalling: row.post_calling || (row.raw_data.postCalling) || '',
      bookingDate: row.booking_date,
      dispatchDate: row.dispatch_date,
      deliveryDate: row.delivery_date,
      expectedDeliveryDate: row.expected_delivery_date,
      delivered: row.delivered === true || row.delivered === 'true' || row.status === 'DELIVERED' || row.parcelStatus === 'DELIVERED',
      deliveredAt: row.delivered_at || '',
      remarks: row.remarks
    };
  }
  return {
    id: row.id,
    devoteeId: row.devotee_id,
    devoteeName: row.devotee_name,
    spiritualName: row.spiritual_name,
    legalName: row.legal_name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    pincode: row.pincode,
    addressVerified: row.address_verified,
    status: row.status || 'Packed',
    parcelStatus: row.status || 'Packed',
    courierPartner: row.courier_partner,
    courierTrackingNo: row.courier_tracking_no,
    trackingId: row.tracking_id,
    deliveryMode: cloudDeliveryMode(),
    preCalling: row.pre_calling || '',
    postCalling: row.post_calling || '',
    bookingDate: row.booking_date,
    dispatchDate: row.dispatch_date,
    deliveryDate: row.delivery_date,
    expectedDeliveryDate: row.expected_delivery_date,
    delivered: row.delivered === true || row.delivered === 'true' || row.status === 'DELIVERED' || row.parcelStatus === 'DELIVERED',
    deliveredAt: row.delivered_at || '',
    remarks: row.remarks,
    createdAt: row.created_at
  };
}

async function fetchParcelsFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data, error } = await client
      .from('parcels')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase parcels query notice:', error.message);
      return;
    }

    if (Array.isArray(data)) {
      const deletedIds = getDeletedParcelIds();
      const activeParcels = [];
      const staleDeletedIdsInCloud = [];

      data.forEach(row => {
        const p = fromSupabaseParcel(row);
        if (p && p.id && deletedIds.has(String(p.id))) {
          staleDeletedIdsInCloud.push(String(p.id));
        } else if (p && p.id) {
          activeParcels.push(p);
        }
      });

      // Background purge: if Supabase still had records that were deleted locally, purge them from Supabase Cloud now!
      if (staleDeletedIdsInCloud.length > 0) {
        for (let i = 0; i < staleDeletedIdsInCloud.length; i += 50) {
          const chunk = staleDeletedIdsInCloud.slice(i, i + 50);
          client.from('parcels').delete().in('id', chunk).then(() => {
            console.log(`🧹 Purged ${chunk.length} stale deleted parcels from Supabase Cloud.`);
          }).catch(() => {});
        }
      }

      state.parcels = activeParcels;
      localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels));
      renderParcelsTable();
      renderBirthdaysGrid();
      updateKPIs();
      if (window.lucide) lucide.createIcons();
    }
  } catch (err) {
    console.warn('Parcels sync exception:', err);
  }
}

function handleParcelSyncError(error, silent) {
  if (error && /could not find the table|does not exist|relation .* does not exist|404/i.test(error.message || '')) {
    console.warn('☁️ Cloud parcels table ("public.parcels") is missing. Run supabase-setup.sql in the Supabase SQL Editor to create it — then parcels will sync to the live website.');
    if (!silent) showToast('Cloud parcels table missing — run supabase-setup.sql in Supabase SQL Editor (file is in the project folder).', 'warning');
  } else if (error) {
    console.warn('⚠️ Parcel cloud sync notice:', error.message);
  }
}

async function syncParcelToSupabase(parcel, silent = false) {
  if (!parcel || !parcel.id) return;
  const deletedIds = getDeletedParcelIds();
  if (deletedIds.has(String(parcel.id))) return; // Never sync deleted parcel

  const client = getSupabaseClient();
  if (!client) return;

  try {
    const payload = toSupabaseParcel(parcel);
    const { error } = await client.from('parcels').upsert(payload, { onConflict: 'id' });
    if (error) {
      handleParcelSyncError(error, silent);
    } else {
      console.log('✅ Parcel successfully synced to Supabase Cloud:', parcel.id);
    }
  } catch (err) {
    console.warn('Parcel cloud sync error:', err);
  }
}

async function syncAllLocalParcelsToCloud(silent = false) {
  const client = getSupabaseClient();
  if (!client) return;

  const deletedIds = getDeletedParcelIds();
  const activeParcels = (state.parcels || []).filter(p => p && p.id && !deletedIds.has(String(p.id)));
  if (activeParcels.length === 0) return;

  try {
    const payloads = activeParcels.map(toSupabaseParcel);
    const { error } = await client.from('parcels').upsert(payloads, { onConflict: 'id' });
    if (error) {
      handleParcelSyncError(error, silent);
    } else {
      console.log(`✅ Bulk synced ${payloads.length} parcels to Supabase Cloud.`);
    }
  } catch (e) {
    console.warn('Bulk parcel sync exception:', e);
  }
}

// Push the bundled master devotee list to Supabase so the cloud has a full
// directory (first load / manual Cloud Sync). Respects RLS: it works only if
// the optional devotees policies in supabase-setup.sql were created; otherwise
// it logs a friendly notice and the portal keeps using the bundled data.
function pushMasterDevoteesToSupabase() {
  const client = getSupabaseClient();
  if (!client || !state.devotees || state.devotees.length === 0) return Promise.resolve();
  // Any attempt (auto or manual) counts — avoids retrying the 824-row push on
  // every page load after a failed try. Manual "Cloud Sync" always retries.
  localStorage.setItem('cloud-devotees-attempted', '1');
  return (async () => {
    const rows = state.devotees.map(d => ({
      'SL NO': d.slNo || 0,
      'DEVOTEE ID': d.id || '',
      'NAME': d.legalName || '',
      'INITIATED NAME': d.spiritualName || '',
      'SPOUSE NAME': d.spouseName || '',
      'BIRTHDAY': d.birthdayRaw || '',
      'ANNIVERSARY': d.anniversaryRaw || '',
      'CONTACT NO': d.phone || '',
      'ADDRESS': d.address || '',
      'CITY': d.city || '',
      'STATE': d.state || '',
      'PIN CODE': d.pincode || '',
      'PHOTO': d.photo || ''
    }));
    const attempt = async (onConflict) => {
      if (onConflict) {
        return await client.from('devotees').upsert(rows, { onConflict });
      }
      return await client.from('devotees').insert(rows);
    };
    try {
      // Try the most likely primary key first, then fall back gracefully.
      let { data, error } = await attempt('DEVOTEE ID');
      if (error) ({ data, error } = await attempt('devotee_id'));
      if (error && /no unique or exclusion constraint matching/i.test(error.message || '')) {
        ({ data, error } = await attempt(null));
      }
      if (error) {
        if (/permission denied|could not find|does not exist/i.test(error.message || '')) {
          console.warn('☁️ Cloud devotee seeding skipped:', error.message, '— enable the optional devotees policies in supabase-setup.sql if you want it.');
        } else {
          console.warn('Devotee seeding notice:', error.message);
        }
      } else {
        localStorage.setItem('cloud-devotees-seeded', '1');
        console.log(`✅ Synced ${rows.length} master devotees to Supabase Cloud.`);
      }
    } catch (e) {
      console.warn('Devotee seeding exception:', e);
    }
  })();
}

let realtimeSyncActive = false;
function setupRealtimeSync() {
  if (realtimeSyncActive) return;
  const client = getSupabaseClient();
  if (!client) return;

  try {
    client.channel('public:parcels-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, async (payload) => {
        console.log('⚡ Realtime parcel event detected:', payload.eventType);
        await fetchParcelsFromSupabase();
      })
      .subscribe();

    client.channel('public:devotees-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devotees' }, async (payload) => {
        console.log('⚡ Realtime devotee event detected:', payload.eventType);
        await initSupabaseAndSync();
      })
      .subscribe();

    client.channel('public:activity_log-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, async (payload) => {
        console.log('⚡ Realtime activity event detected:', payload.eventType);
        await loadActivityLogFromCloud();
      })
      .subscribe();

  } catch (e) {
    console.warn('Realtime subscription warning:', e);
  }
}

function initApp() {
  const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
  loadFromStorage();

  // If not initialized or existing storage has fewer than 800 devotees, sync with all 824 master devotees!
  if (!isInit || !state.devotees || state.devotees.length < 800) {
    if (typeof DURGAPUR_DEVOTEES !== 'undefined' && Array.isArray(DURGAPUR_DEVOTEES) && DURGAPUR_DEVOTEES.length > 0) {
      state.devotees = DURGAPUR_DEVOTEES;
    } else {
      state.devotees = getInitialSampleData().devotees;
    }
    const seed = getInitialSampleData();
    if (!state.counselors || state.counselors.length === 0) state.counselors = seed.counselors;
    if (Array.isArray(state.devotees)) state.devotees.forEach(clearDevoteeParcelTrace);
    saveToStorage();
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  }

  // PERMANENT ONE-TIME DELETE of the legacy parcel-tracking system — clears every
  // old parcel entry (including the delivery fields baked into devotee data) so
  // the Parcel Tracking list starts empty. Parcels appear ONLY when created and
  // auto-synced from the Birthday / Anniversary lists. Runs once, then future
  // sessions preserve the parcels users create.
  let parcelPurged = false;
  try { parcelPurged = !!localStorage.getItem(STORAGE_KEYS.PARCEL_PURGED); } catch (e) { parcelPurged = false; }
  if (!parcelPurged) {
    purgeLegacyParcelEntries();
    saveToStorage();
    try { localStorage.setItem(STORAGE_KEYS.PARCEL_PURGED, 'true'); } catch (e) { /* ignore */ }
  }

  // One-time reset of Marital Status, Address Verified, and Mode of Delivery columns
  let targetColsReset = false;
  try { targetColsReset = !!localStorage.getItem('iskcon_target_cols_empty_v1'); } catch (e) { targetColsReset = false; }
  if (!targetColsReset) {
    if (Array.isArray(state.devotees)) {
      state.devotees.forEach(d => {
        d.maritalStatus = '';
        d.addressVerified = '';
        d.deliveryMode = '';
        d.courierPartner = '';
      });
    }
    if (Array.isArray(state.parcels)) {
      state.parcels.forEach(p => {
        p.addressVerified = '';
        p.deliveryMode = '';
        p.courierPartner = '';
      });
    }
    saveToStorage();
    try { localStorage.setItem('iskcon_target_cols_empty_v1', 'true'); } catch (e) { /* ignore */ }
  }

  // Display current date in banner
  const todayBadge = document.getElementById('current-date-badge');
  if (todayBadge) {
    todayBadge.innerText = todayDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Live Date & Time in top bar
  updateLiveDateTime();
  setInterval(updateLiveDateTime, 1000);

  // Initialize Supabase Auth & Gated Session (Strict Authentication Gateway)
  // Devotee directory, parcels, and dashboard are rendered ONLY after authentication succeeds.
  initAuthSystem();
}

let _portalRenderedOnce = false;
function renderAuthenticatedPortal() {
  populateMonthFilters();
  populateCityFilter();
  populateMaritalStatusFilter();
  updateKPIs();
  renderDashboard();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  renderRemovedCelebrationSection();
  updateActivityNavBadge();
  loadStaffListFromCloud();
  if (typeof initCharts === 'function') initCharts();
  if (window.lucide) lucide.createIcons();
  _portalRenderedOnce = true;
}

let _cloudSyncDebounceTimer = null;
function saveToStorage() {
  localStorage.setItem(STORAGE_KEYS.DEVOTEES, JSON.stringify(state.devotees));
  localStorage.setItem(STORAGE_KEYS.COUNSELORS, JSON.stringify(state.counselors));
  localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels || []));
  localStorage.setItem(STORAGE_KEYS.ANNIV_REMOVED, JSON.stringify(state.anniversaryRemovedIds || []));
  localStorage.setItem(STORAGE_KEYS.BDAY_REMOVED, JSON.stringify(state.birthdayRemovedIds || []));
  localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(state.activityLog || []));

  // Auto-sync parcels to Supabase Cloud so all users see changes (debounced 1s).
  // Silent: background saves must not nag the user while the cloud table is
  // still missing — the manual "Cloud Sync" button shows the guidance.
  clearTimeout(_cloudSyncDebounceTimer);
  _cloudSyncDebounceTimer = setTimeout(() => {
    syncAllLocalParcelsToCloud(true);
  }, 1000);
}

async function handleManualCloudSync() {
  if (!requirePermission('cloud_sync', 'sync data with the cloud')) return;
  const btn = document.getElementById('cloud-sync-btn');
  const txt = document.getElementById('cloud-sync-btn-text');
  if (btn) btn.disabled = true;
  if (txt) txt.innerText = 'Syncing...';

  try {
    // 1. Push all local parcels to Supabase
    await syncAllLocalParcelsToCloud();
    // 1b. Best-effort: also push the master devotee list to the cloud
    await pushMasterDevoteesToSupabase();
    // 2. Fetch fresh parcels from Supabase
    await fetchParcelsFromSupabase();
    // 3. Fetch fresh devotees from Supabase
    await initSupabaseAndSync();

    logActivity('sync', 'Database', 'Cloud sync completed.');
    showToast('☁️ Cloud Sync Complete! All data is synchronized between all sevaks.', 'success');
  } catch (e) {
    console.error('Manual sync error:', e);
    showToast('Cloud sync completed with local cached copy.', 'info');
  } finally {
    if (btn) btn.disabled = false;
    if (txt) txt.innerText = 'Cloud Sync';
    if (window.lucide) lucide.createIcons();
  }
}

function loadFromStorage() {
  try {
    const deletedParcelIds = getDeletedParcelIds();
    const deletedDevIds = getDeletedDevoteeIds();
    state.devotees = (JSON.parse(localStorage.getItem(STORAGE_KEYS.DEVOTEES)) || [])
      .filter(d => d && d.id && !deletedDevIds.has(String(d.id)));
    state.counselors = JSON.parse(localStorage.getItem(STORAGE_KEYS.COUNSELORS)) || [];
    state.parcels = (JSON.parse(localStorage.getItem(STORAGE_KEYS.PARCELS)) || [])
      .filter(p => p && p.id && !deletedParcelIds.has(String(p.id)));
    const rawRemoved = localStorage.getItem(STORAGE_KEYS.ANNIV_REMOVED);
    state.anniversaryRemovedIds = rawRemoved ? JSON.parse(rawRemoved) : [];
    if (!Array.isArray(state.anniversaryRemovedIds)) state.anniversaryRemovedIds = [];
    const rawBdayRemoved = localStorage.getItem(STORAGE_KEYS.BDAY_REMOVED);
    state.birthdayRemovedIds = rawBdayRemoved ? JSON.parse(rawBdayRemoved) : [];
    if (!Array.isArray(state.birthdayRemovedIds)) state.birthdayRemovedIds = [];
    const rawActivity = localStorage.getItem(STORAGE_KEYS.ACTIVITY);
    state.activityLog = rawActivity ? JSON.parse(rawActivity) : [];
    if (!Array.isArray(state.activityLog)) state.activityLog = [];
  } catch (e) {
    console.error('Error loading data from storage:', e);
    const seed = getInitialSampleData();
    state.devotees = (typeof DURGAPUR_DEVOTEES !== 'undefined' && Array.isArray(DURGAPUR_DEVOTEES)) ? DURGAPUR_DEVOTEES : seed.devotees;
    state.counselors = seed.counselors;
    state.parcels = [];
    state.anniversaryRemovedIds = [];
    state.birthdayRemovedIds = [];
    saveToStorage();
  }
}

// Remove the auto-synced parcel-tracking fields from one devotee record.
function clearDevoteeParcelTrace(d) {
  if (!d || typeof d !== 'object') return;
  const parcelTraceFields = [
    'parcelStatus', 'parcelStatusText', 'trackingId', 'courierPartner',
    'courierTrackingNo', 'bookingDate', 'expectedDeliveryDate',
    'dispatchDate', 'estimatedDelivery', 'deliveryDate', 'deliveryAgent',
    'parcelCreatedAt', 'parcelCreated', 'hasParcel', 'parcelType', 'parcelDescription',
    'packageContents'
  ];
  parcelTraceFields.forEach(f => {
    try { delete d[f]; } catch (e) { /* ignore */ }
  });
}

// PERMANENTLY delete EVERY old parcel-tracking entry (not hidden / not archived).
// Parcel Tracking now only ever lists live records from state.parcels, which are
// created and auto-synced from the Birthday / Anniversary celebration lists.
function purgeLegacyParcelEntries() {
  try { localStorage.removeItem(STORAGE_KEYS.PARCELS); } catch (e) { /* ignore */ }
  state.parcels = [];
  if (state.selectedParcels) state.selectedParcels.clear();
  (state.devotees || []).forEach(clearDevoteeParcelTrace);
}

// Update Datalist for autocomplete in modals
function updateDevoteeAutocompleteList() {
  const dl = document.getElementById('devotee-autocomplete-list');
  if (!dl) return;
  dl.innerHTML = '';
  state.devotees.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
    dl.appendChild(opt);
  });
}

// ----------------------------------------------------
// LIVE DATE & TIME + SIGN IN
// ----------------------------------------------------
function updateLiveDateTime() {
  const el = document.getElementById('live-date-time');
  if (!el) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  el.innerText = `${dateStr} • ${timeStr}`;
}

// ======================================================================
// 🌗 LIGHT / DARK THEME TOGGLE
// ======================================================================
// The saved preference is applied before first paint by an inline <head>
// script (see index.html). This function flips it at runtime and persists.
function applyThemeIcons() {
  // Icons are swapped purely via CSS (html.dark .theme-icon-moon etc.),
  // but re-run lucide so any freshly injected markup also renders.
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (e) { /* ignore */ }
  }
}

function setTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  try { localStorage.setItem('iskcon-theme', isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  applyThemeIcons();
  return isDark;
}

function toggleTheme() {
  const isDark = !document.documentElement.classList.contains('dark');
  setTheme(isDark ? 'dark' : 'light');
  if (typeof showToast === 'function') {
    showToast(isDark ? '🌙 Dark mode enabled' : '☀️ Light mode enabled');
  }
}

// ======================================================================
// 📱 MOBILE TABLES — auto-label multi-column tables so CSS can turn them
// into stacked cards on phones (labels are inert on desktop).
// ======================================================================
function applyMobileTableLabels() {
  document.querySelectorAll('table').forEach(table => {
    const thead = table.querySelector('thead');
    if (!thead) return;

    const headers = Array.from(thead.querySelectorAll('th'))
      .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim());

    // Only touch genuine data tables (4+ columns) …
    if (headers.length < 4) return;

    const dataRows = Array.from(table.querySelectorAll('tbody tr')).filter(
      tr => tr.children.length && !(tr.children.length === 1 && tr.children[0].hasAttribute('colspan'))
    );
    if (!dataRows.length) return;

    // … and only when every row lines up with the header (safe — otherwise leave it swipeable).
    if (!dataRows.every(tr => tr.children.length === headers.length)) return;

    // (Re)label the rows — freshly rendered rows may not carry labels yet.
    dataRows.forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        let label = headers[i] || '';
        if (!label || label === '') {
          if (td.querySelector('input[type="checkbox"]')) label = 'Select';
          else if (td.querySelector('button, a')) label = 'Action';
        }
        // Normalize common action/select labels
        if (/^(action|actions)$/i.test(label)) label = 'Action';
        if (/^(#|s\.no\.?|sl\.?|sl\s*no\.?)$/i.test(label)) label = '#';
        if (/^(select|sel)$/i.test(label)) label = 'Select';
        // Clean up emojis from header like "📞 Phone" -> "Phone"
        label = label.replace(/[^\w\s.#/-]/gi, '').trim();

        td.setAttribute('data-label', label);
      });
    });
    if (!table.classList.contains('responsive-table')) table.classList.add('responsive-table');
  });
}

let _mobileLabelTimer = null;
function scheduleMobileTableLabels() {
  if (_mobileLabelTimer) clearTimeout(_mobileLabelTimer);
  _mobileLabelTimer = setTimeout(applyMobileTableLabels, 120);
}

// Re-label whenever new rows/tables are rendered anywhere in the portal.
if (typeof MutationObserver !== 'undefined') {
  try {
    new MutationObserver(scheduleMobileTableLabels)
      .observe(document.getElementById('portal-app') || document.body, { childList: true, subtree: true });
    scheduleMobileTableLabels();
  } catch (e) { /* ignore */ }
}

// ======================================================================
// 🔐 SUPABASE AUTHENTICATION & ACCESS CONTROL (ISKCON DURGAPUR)
// ======================================================================
let currentUser = null;
let currentUserRole = 'VIEWER';
let currentUserProfile = null;
// Does the `profiles` table exist in Supabase? null = not checked yet.
// true → roles are live (a missing row means least privilege, NOT admin).
// false → setup SQL not run yet, so fall back to ADMIN (no behavior change).
let profilesTableAvailable = null;

// Role Definitions & Display Config
const USER_ROLES = {
  SUPER_ADMIN: {
    id: 'SUPER_ADMIN',
    label: 'Super Admin',
    badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
  },
  ADMIN: {
    id: 'ADMIN',
    label: 'Admin',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
  },
  USER: {
    id: 'USER',
    label: 'User',
    badgeClass: 'bg-teal-500/20 text-teal-300 border border-teal-400/30'
  },
  STAFF: {
    id: 'STAFF',
    label: 'Staff',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
  },
  VIEWER: {
    id: 'VIEWER',
    label: 'Viewer',
    badgeClass: 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
  }
};

// ------------------------------------------------------------
// PHASE 1: ROLE-BASED PANELS (Admin Panel / User Panel)
// ------------------------------------------------------------
// Which top-level panel each role belongs to.
const ROLE_PANELS = {
  SUPER_ADMIN: 'ADMIN',
  ADMIN: 'ADMIN',
  STAFF: 'ADMIN',
  USER: 'USER',
  VIEWER: 'USER'
};

// Tabs each role is allowed to open (nav gating + switchTab guard)
const ROLE_TAB_ACCESS = {
  SUPER_ADMIN: ['dashboard', 'devotees', 'birthdays', 'anniversaries', 'parcels', 'removed', 'requests', 'roles', 'activity'],
  ADMIN: ['dashboard', 'devotees', 'birthdays', 'anniversaries', 'parcels', 'removed', 'requests', 'roles', 'activity'],
  STAFF: ['devotees', 'birthdays', 'anniversaries', 'parcels', 'activity'],
  USER: ['birthdays', 'anniversaries', 'parcels'],
  VIEWER: ['devotees', 'birthdays', 'anniversaries', 'parcels']
};

// Action permissions per role ('*' = every action)
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['edit_devotees', 'manage_celebrations', 'create_parcels', 'manage_requests', 'manage_settings', 'export_data', 'cloud_sync'],
  STAFF: ['edit_devotees', 'manage_celebrations', 'create_parcels', 'request_delete', 'export_data', 'cloud_sync'],
  USER: ['create_parcels'],   // may create parcels & send wishes — main database stays read-only
  VIEWER: []                  // read-only
};

// Helper role checks
function isSuperAdmin() {
  return getActiveRoleKey() === 'SUPER_ADMIN';
}

function isAdmin() {
  return getActiveRoleKey() === 'ADMIN';
}

function isAdminOrSuper() {
  const k = getActiveRoleKey();
  return k === 'SUPER_ADMIN' || k === 'ADMIN';
}

function isStaff() {
  return getActiveRoleKey() === 'STAFF';
}

function isViewer() {
  return getActiveRoleKey() === 'VIEWER';
}

// Resolve the signed-in role key (fail-closed to VIEWER when unknown)
function getActiveRoleKey() {
  const key = String(currentUserRole || 'VIEWER').trim().toUpperCase().replace(/[\s-]/g, '_');
  return USER_ROLES[key] ? key : 'VIEWER';
}

// 'ADMIN' panel = SUPER_ADMIN/ADMIN/STAFF · 'USER' panel = USER/VIEWER
function getActivePanel() {
  return ROLE_PANELS[getActiveRoleKey()] || 'USER';
}

function allowedTabsForRole(roleKey) {
  const r = roleKey || getActiveRoleKey();
  let tabs = [...(ROLE_TAB_ACCESS[r] || ROLE_TAB_ACCESS.VIEWER)];

  // 🎯 WORK ASSIGNMENT ENFORCEMENT: Staff only sees modules they are assigned to ("they will do that only")
  if (r === 'STAFF') {
    let assigned = null;
    if (currentUserProfile && currentUserProfile.assigned_work) {
      if (Array.isArray(currentUserProfile.assigned_work) && currentUserProfile.assigned_work.length > 0) {
        assigned = currentUserProfile.assigned_work;
      } else if (typeof currentUserProfile.assigned_work === 'string') {
        try {
          const parsed = JSON.parse(currentUserProfile.assigned_work);
          if (Array.isArray(parsed) && parsed.length > 0) assigned = parsed;
        } catch (e) {}
      }
    }
    // Also check cached staffList if currentUser matches
    if (!assigned && currentUser && Array.isArray(state.staffList)) {
      const match = state.staffList.find(s => (s.id && s.id === currentUser.id) || (s.email && s.email.toLowerCase() === (currentUser.email || '').toLowerCase()));
      if (match && Array.isArray(match.assignedWork) && match.assignedWork.length > 0) {
        assigned = match.assignedWork;
      }
    }

    if (assigned && assigned.length > 0) {
      tabs = tabs.filter(t => assigned.includes(t));
      if (tabs.length === 0) tabs = ['birthdays'];
    }
  }

  return tabs;
}

// Does the current role have this permission?
function can(perm) {
  if (!currentUser) return false;
  const list = ROLE_PERMISSIONS[getActiveRoleKey()] || [];
  return list.includes('*') || list.includes(perm);
}

// Guard used at the top of every restricted action — shows a toast and
// returns false when the signed-in role is not allowed to run it.
function requirePermission(perm, actionLabel) {
  if (can(perm)) return true;
  const label = (USER_ROLES[getActiveRoleKey()] || USER_ROLES.ADMIN).label;
  showToast(`⛔ Permission denied — ${label} cannot ${actionLabel || 'run this action'}. Ask an Admin.`, 'error');
  if (typeof recordAuditEvent === 'function') {
    recordAuditEvent({
      action: 'denied',
      module: 'security',
      recordId: perm,
      summary: `Access Denied: ${label} attempted to ${actionLabel || perm}.`,
      result: 'DENIED'
    });
  }
  return false;
}

// Apply role gating: hide nav tabs the role can't open & keep the current tab legal
function enforceRoleUI() {
  const allowed = allowedTabsForRole();

  document.querySelectorAll('.nav-tab[data-tab]').forEach(btn => {
    const t = btn.getAttribute('data-tab');
    if (t) btn.classList.toggle('hidden', !allowed.includes(t));
  });

  const current = state.currentTab || (allowed.includes('dashboard') ? 'dashboard' : allowed[0]);
  if (!allowed.includes(current)) {
    switchTab(allowed.includes('dashboard') ? 'dashboard' : allowed[0]);
  }

  // 🛡️ Viewer role restrictions: hide Add Devotee button & mutation controls
  const isViewOnly = isViewer();
  const addDevoteeBtn = document.getElementById('btn-add-devotee');
  if (addDevoteeBtn) addDevoteeBtn.classList.toggle('hidden', isViewOnly);

  // 🛡️ Staff role restrictions: hide Add Staff button for non-super-admins
  const addStaffBtn = document.getElementById('btn-add-staff-modal');
  if (addStaffBtn) addStaffBtn.classList.toggle('hidden', !isSuperAdmin());
}

async function fetchUserProfile(user) {
  if (!user || !user.id) return null;
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    // 1. Query 'user_profiles' table (the Supabase user & role model)
    let { data, error } = await client
      .from('user_profiles')
      .select('id, email, full_name, role, division, assigned_work')
      .eq('id', user.id)
      .maybeSingle();

    // 2. Fallback to 'profiles' if user_profiles does not exist
    if (error && /does not exist|42P01|PGRST205|schema cache|Could not find the table/i.test(error.message || '')) {
      const pRes = await client
        .from('profiles')
        .select('id, email, role, division, assigned_work')
        .eq('id', user.id)
        .maybeSingle();
      data = pRes.data;
      error = pRes.error;
    }

    if (error) {
      const detail = `${error.message || ''} ${error.code || ''} ${error.details || ''}`;
      if (/does not exist|42P01|PGRST205|schema cache|Could not find the table/i.test(detail)) {
        profilesTableAvailable = false; // setup SQL not run yet
      }
      console.warn('User profile lookup info:', error.message || error);
      return null;
    }

    profilesTableAvailable = true;

    if (data) {
      if (typeof data.assigned_work === 'string' && data.assigned_work.startsWith('[')) {
        try { data.assigned_work = JSON.parse(data.assigned_work); } catch (e) {}
      }
      currentUserProfile = data;
      currentUserRole = getUserRole(user);
      console.log('✅ Loaded user profile from Supabase:', currentUserProfile);
      return data;
    }
    console.warn('⚠️ No profile row for', user.email, '— treating this account as USER (least privilege).');
  } catch (err) {
    console.warn('Profiles table lookup info:', err);
  }
  return null;
}

function getUserRole(user) {
  if (!user) return 'VIEWER';
  if (currentUserProfile && currentUserProfile.role) {
    const pRole = currentUserProfile.role.trim().toUpperCase().replace(/[\s-]/g, '_');
    if (pRole === 'SUPER_ADMIN') return 'SUPER_ADMIN';
    if (pRole === 'ADMIN') return 'ADMIN';
    if (pRole === 'STAFF') return 'STAFF';
    if (pRole === 'USER') return 'USER';
    if (pRole === 'VIEWER') return 'VIEWER';
    if (USER_ROLES[pRole]) return pRole;
  }
  const rawRole = (
    user.user_metadata?.role ||
    user.app_metadata?.role ||
    user.role ||
    'VIEWER' // Fail closed: no explicit role anywhere means least privilege
  ).toString().toUpperCase().replace(/[\s-]/g, '_');

  // Fail closed: once the profiles table exists, a login with no matching
  // row is a plain USER — it must NOT inherit Admin access.
  if (profilesTableAvailable === true) return 'USER';

  return USER_ROLES[rawRole] ? rawRole : 'VIEWER';
}

function getUserDivision() {
  if (currentUserProfile && currentUserProfile.division) {
    return currentUserProfile.division;
  }
  return 'All';
}

function getUserDisplayName(user) {
  if (!user) return 'Devotee';
  if (currentUserProfile && currentUserProfile.full_name && currentUserProfile.full_name.trim()) {
    return currentUserProfile.full_name.trim();
  }
  if (user.user_metadata?.full_name && user.user_metadata.full_name.trim()) {
    return user.user_metadata.full_name.trim();
  }
  if (user.user_metadata?.name && user.user_metadata.name.trim()) {
    return user.user_metadata.name.trim();
  }
  if (user.email) {
    const raw = user.email.split('@')[0].replace(/[._-]/g, ' ');
    return raw.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return 'Devotee';
}

// Welcome celebration window removed
window.triggerWelcomeCelebration = () => {};
window.dismissWelcomeCelebration = () => {};


// ----------------------------------------------------
// 🛡️ ROLE-BASED DELETION REQUEST & APPROVAL SYSTEM
// ----------------------------------------------------
let deleteRequestsChannel = null;
let deleteRequestsPollTimer = null;

function openDeleteRequestModal(target) {
  if (!target || !target.id) return;

  // 1. Prevent duplicate pending requests for the same record
  const existingPending = (state.deleteRequests || []).find(
    r => String(r.record_id) === String(target.id) && r.status === 'PENDING'
  );
  if (existingPending) {
    showToast(`A deletion request for "${target.title || 'this record'}" is already pending Super Admin approval.`, 'warning');
    return;
  }

  const modal = document.getElementById('delete-request-modal');
  const targetIdInput = document.getElementById('del-req-target-id');
  const targetTypeInput = document.getElementById('del-req-target-type');
  const badgeTypeEl = document.getElementById('del-req-badge-type');
  const titleEl = document.getElementById('del-req-target-title');
  const reasonInput = document.getElementById('del-req-reason');

  const targetType = target.type || 'DEVOTEE';
  if (targetIdInput) targetIdInput.value = target.id;
  if (targetTypeInput) targetTypeInput.value = targetType;
  if (badgeTypeEl) badgeTypeEl.textContent = `${targetType} RECORD`;
  if (titleEl) titleEl.textContent = target.title || 'Selected Record';

  // 2. Capture a safe snapshot of the record details to store in delete_requests
  let snapshot = null;
  if (targetType === 'DEVOTEE') {
    const dev = (state.devotees || []).find(x => String(x.id) === String(target.id));
    if (dev) {
      snapshot = {
        id: dev.id,
        slNo: dev.slNo || null,
        legalName: dev.legalName || null,
        spiritualName: dev.spiritualName || null,
        phone: dev.phone || dev.whatsapp || null,
        email: dev.email || null,
        dob: dev.dob || null,
        marriageAnniversary: dev.marriageAnniversary || null,
        city: dev.city || null,
        state: dev.state || null,
        currentAddress: dev.currentAddress || null,
        department: dev.department || null,
        sangha: dev.sangha || null
      };
    }
  } else if (targetType === 'PARCEL') {
    const prc = (state.parcels || []).find(x => String(x.id) === String(target.id));
    if (prc) {
      snapshot = {
        id: prc.id,
        devoteeId: prc.devoteeId || null,
        trackingNumber: prc.trackingNumber || null,
        legalName: prc.legalName || null,
        spiritualName: prc.spiritualName || null,
        phone: prc.phone || null,
        deliveryMode: prc.deliveryMode || null,
        courierPartner: prc.courierPartner || null,
        status: prc.status || null
      };
    }
  }

  if (modal) {
    modal.dataset.snapshot = JSON.stringify(snapshot || {});
  }

  if (reasonInput) {
    reasonInput.value = '';
    setTimeout(() => reasonInput.focus(), 150);
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeDeleteRequestModal() {
  const modal = document.getElementById('delete-request-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleDeleteRequestSubmit(event) {
  event.preventDefault();
  const targetId = document.getElementById('del-req-target-id')?.value;
  const targetType = document.getElementById('del-req-target-type')?.value || 'DEVOTEE';
  const targetTitle = document.getElementById('del-req-target-title')?.textContent || 'Record';
  const reasonInput = document.getElementById('del-req-reason');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!reason || reason.length < 5) {
    showToast('Please provide a clear reason (minimum 5 characters) for the Super Admin.', 'warning');
    return;
  }

  // Prevent duplicate submissions
  const existingPending = (state.deleteRequests || []).find(
    r => String(r.record_id) === String(targetId) && r.status === 'PENDING'
  );
  if (existingPending) {
    showToast('A pending deletion request already exists for this record.', 'warning');
    closeDeleteRequestModal();
    return;
  }

  const submitBtn = document.getElementById('del-req-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Submitting to Super Admin...</span>`;
  }

  const modal = document.getElementById('delete-request-modal');
  let snapshot = null;
  if (modal && modal.dataset.snapshot) {
    try { snapshot = JSON.parse(modal.dataset.snapshot); } catch (e) {}
  }

  const requesterName = getUserDisplayName(currentUser);
  const requesterEmail = currentUser?.email || 'staff@iskcon.org';
  const requesterId = currentUser?.id || null;
  const reqUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;

  const newRequest = {
    record_id: String(targetId),
    record_type: targetType,
    record_title: targetTitle,
    record_details: snapshot,
    reason: reason,
    requested_by_id: requesterId,
    requested_by_email: requesterEmail,
    requested_by_name: requesterName,
    status: 'PENDING',
    created_at: new Date().toISOString()
  };
  if (reqUuid) newRequest.id = reqUuid;

  try {
    const client = getSupabaseClient();
    if (client) {
      // Direct insert without .select() so PostgreSQL does not trigger RETURNING RLS check on non-admin accounts
      const { error } = await client
        .from('delete_requests')
        .insert([newRequest]);

      if (error) {
        console.error('Supabase delete_requests insert error:', error);
        if (error.code === 'PGRST205' || (error.message && error.message.includes('Could not find'))) {
          showToast('⚠️ Database table "delete_requests" not found in Supabase. Please run the SQL migration in the Supabase SQL Editor.', 'error');
        } else if (error.message && error.message.includes('duplicate')) {
          showToast('A pending deletion request already exists for this record.', 'warning');
        } else {
          showToast(`Error submitting request: ${error.message || 'Permission denied'}`, 'error');
        }
        return;
      }
    }
  } catch (err) {
    console.error('Delete request cloud sync exception:', err);
    showToast('Network error submitting request to Supabase.', 'error');
    return;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Send Deletion Request</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }

  // Prepend to local state
  if (!state.deleteRequests) state.deleteRequests = [];
  state.deleteRequests.unshift(newRequest);

  closeDeleteRequestModal();
  logActivity('request_delete', targetType, `Requested deletion of ${targetTitle}: "${reason}"`, targetId);
  showToast('Hare Krishna! Deletion request submitted for Super Admin review.', 'success');
  updateRequestsNavBadge();
  renderDeleteRequests();
}

async function fetchDeleteRequests(showToastOnRefresh = false) {
  // Only Admin & Super Admin can view the Delete Requests queue
  if (!isAdminOrSuper()) {
    state.deleteRequests = [];
    updateRequestsNavBadge();
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    updateRequestsNavBadge();
    renderDeleteRequests();
    return;
  }

  try {
    const { data, error } = await client
      .from('delete_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Fetch delete_requests notice:', error.message);
    } else if (data) {
      state.deleteRequests = data;
    }
  } catch (e) {
    console.warn('Fetch delete_requests exception:', e);
  }

  updateRequestsNavBadge();
  renderDeleteRequests();

  if (showToastOnRefresh && typeof showToast === 'function') {
    showToast('Delete requests refreshed.', 'info');
  }
}

function subscribeToDeleteRequests() {
  if (!isAdminOrSuper()) return;
  const client = getSupabaseClient();
  if (!client || !client.channel) return;

  if (deleteRequestsChannel) {
    try { client.removeChannel(deleteRequestsChannel); } catch (e) {}
    deleteRequestsChannel = null;
  }

  try {
    deleteRequestsChannel = client
      .channel('public:delete_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delete_requests' }, payload => {
        console.log('🔔 Realtime event on delete_requests:', payload.eventType);
        fetchDeleteRequests(false);
        if (payload.eventType === 'INSERT' && payload.new?.status === 'PENDING') {
          showToast(`🔔 New delete request: "${payload.new.record_title}" requested by ${payload.new.requested_by_name || 'Staff'}`, 'info');
        }
      })
      .subscribe((status) => {
        console.log('📡 Realtime delete_requests status:', status);
      });
  } catch (err) {
    console.warn('Could not establish delete_requests Realtime channel:', err);
  }

  // Fallback background polling every 30 seconds for Super Admin
  if (!deleteRequestsPollTimer) {
    deleteRequestsPollTimer = setInterval(() => {
      if (isAdminOrSuper()) {
        fetchDeleteRequests(false);
      }
    }, 30000);
  }
}

function unsubscribeFromDeleteRequests() {
  if (deleteRequestsChannel) {
    const client = getSupabaseClient();
    try { if (client) client.removeChannel(deleteRequestsChannel); } catch (e) {}
    deleteRequestsChannel = null;
  }
  if (deleteRequestsPollTimer) {
    clearInterval(deleteRequestsPollTimer);
    deleteRequestsPollTimer = null;
  }
}

function updateRequestsNavBadge() {
  const reqs = state.deleteRequests || [];
  const pendingCount = reqs.filter(r => r.status === 'PENDING').length;
  const approvedCount = reqs.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = reqs.filter(r => r.status === 'REJECTED').length;

  // Nav badge
  const navBadge = document.getElementById('nav-requests-badge');
  if (navBadge) {
    navBadge.textContent = String(pendingCount);
    navBadge.classList.toggle('hidden', pendingCount === 0);
  }

  // KPI cards
  const kpiTotal = document.getElementById('kpi-req-total');
  const kpiPending = document.getElementById('kpi-req-pending');
  const kpiApproved = document.getElementById('kpi-req-approved');
  const kpiRejected = document.getElementById('kpi-req-rejected');

  if (kpiTotal) kpiTotal.textContent = String(reqs.length);
  if (kpiPending) kpiPending.textContent = String(pendingCount);
  if (kpiApproved) kpiApproved.textContent = String(approvedCount);
  if (kpiRejected) kpiRejected.textContent = String(rejectedCount);
}

function filterDeleteRequests(status, btnEl) {
  state.deleteRequestsFilter = status || 'ALL';
  document.querySelectorAll('.req-filter-btn').forEach(b => {
    b.classList.remove('active', 'bg-white', 'text-slate-800', 'shadow-xs');
    b.classList.add('text-slate-600');
  });
  if (btnEl) {
    btnEl.classList.add('active', 'bg-white', 'text-slate-800', 'shadow-xs');
    btnEl.classList.remove('text-slate-600');
  }
  renderDeleteRequests();
}

function renderDeleteRequests() {
  const container = document.getElementById('delete-requests-container');
  if (!container) return;

  // Strictly enforce admin view
  if (!isAdminOrSuper()) {
    container.innerHTML = `
      <div class="p-10 text-center text-slate-500 space-y-2">
        <div class="text-3xl">🛡️</div>
        <p class="font-bold text-slate-800 text-sm">Admin Access Only</p>
        <p class="text-xs text-slate-500">Only authorized Super Admin can access the Delete Requests review queue.</p>
      </div>
    `;
    return;
  }

  const clearBtn = document.getElementById('btn-clear-delete-requests');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !isSuperAdmin());
  }

  const hintEl = document.getElementById('requests-role-hint');
  if (hintEl) {
    if (isSuperAdmin()) {
      hintEl.innerHTML = `<span class="text-amber-600 font-bold">🛡️ Super Admin Access:</span> Full authority to Approve (Yes) or Reject (No) requests.`;
    } else {
      hintEl.innerHTML = `<span class="text-slate-600 font-bold">🛡️ Admin View:</span> Awaiting Super Admin approval.`;
    }
  }

  let reqs = state.deleteRequests || [];
  const filter = state.deleteRequestsFilter || 'ALL';
  if (filter !== 'ALL') {
    reqs = reqs.filter(r => r.status === filter);
  }

  if (reqs.length === 0) {
    container.innerHTML = `
      <div class="p-12 text-center text-slate-400 space-y-3">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-2xl text-slate-400">
          🛡️
        </div>
        <p class="font-bold text-slate-700 text-sm">No deletion requests found</p>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">
          ${filter === 'PENDING' ? 'No pending requests requiring approval. All records are safe and secure.' : 'No records match the current filter.'}
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = reqs.map(r => {
    const isPending = r.status === 'PENDING';
    const isApproved = r.status === 'APPROVED';

    let statusBadge = '';
    if (isPending) {
      statusBadge = `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span><span>Pending Review</span></span>`;
    } else if (isApproved) {
      statusBadge = `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><span>✅ Approved & Deleted</span></span>`;
    } else {
      statusBadge = `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"><span>❌ Rejected (Kept)</span></span>`;
    }

    const typeBadge = r.record_type === 'PARCEL'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">📦 Parcel Consignment</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">🪷 Devotee Record</span>`;

    const formattedDate = r.created_at ? new Date(r.created_at).toLocaleString() : 'Recently';

    // 🛡️ ONLY Super Admin sees Approve (Yes) and Reject (No) buttons for PENDING requests
    let actionButtons = '';
    if (isSuperAdmin() && isPending) {
      actionButtons = `
        <div class="flex items-center space-x-2 pt-2 sm:pt-0 shrink-0">
          <button type="button" data-action-approve="${r.id}" onclick="approveDeleteRequest('${r.id}')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer" title="Approve deletion and permanently remove record">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>Approve (Yes)</span>
          </button>
          <button type="button" data-action-reject="${r.id}" onclick="rejectDeleteRequest('${r.id}')" class="px-3 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-sm cursor-pointer" title="Reject deletion and keep record unchanged">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
            <span>Reject (No)</span>
          </button>
        </div>
      `;
    } else if (isPending) {
      actionButtons = `
        <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
          ⏳ Awaiting Super Admin Review
        </span>
      `;
    }

    // Render snapshot details if available
    let snapshotHtml = '';
    const details = r.record_details;
    if (details && typeof details === 'object' && Object.keys(details).length > 0) {
      const pills = [];
      if (details.phone) pills.push(`<b>Phone:</b> ${escapeHtml(details.phone)}`);
      if (details.email) pills.push(`<b>Email:</b> ${escapeHtml(details.email)}`);
      if (details.dob) pills.push(`<b>DOB:</b> ${escapeHtml(details.dob)}`);
      if (details.marriageAnniversary) pills.push(`<b>Anniversary:</b> ${escapeHtml(details.marriageAnniversary)}`);
      if (details.city) pills.push(`<b>City:</b> ${escapeHtml(details.city)}`);
      if (details.trackingNumber) pills.push(`<b>Tracking:</b> ${escapeHtml(details.trackingNumber)}`);
      if (details.courierPartner) pills.push(`<b>Courier:</b> ${escapeHtml(details.courierPartner)}`);
      if (details.status) pills.push(`<b>Status:</b> ${escapeHtml(details.status)}`);

      if (pills.length > 0) {
        snapshotHtml = `
          <div class="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
            <span class="text-slate-400 font-bold uppercase tracking-wider text-[10px] w-full block">Record Snapshot:</span>
            ${pills.map(p => `<span class="bg-white px-2 py-0.5 rounded border border-slate-200">${p}</span>`).join('')}
          </div>
        `;
      }
    }

    return `
      <div class="p-4 sm:p-5 hover:bg-slate-50/80 transition space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-center space-x-2.5">
            ${statusBadge}
            ${typeBadge}
            <span class="text-[11px] text-slate-400 font-medium">${formattedDate}</span>
          </div>
          ${actionButtons}
        </div>

        <div class="space-y-1">
          <h4 class="font-bold text-slate-900 text-sm sm:text-base flex items-center space-x-2">
            <span>${escapeHtml(r.record_title)}</span>
            <span class="text-xs text-slate-400 font-mono font-normal">(ID: ${escapeHtml(r.record_id)})</span>
          </h4>
          <p class="text-xs text-slate-700 bg-amber-50/60 border border-amber-200/60 rounded-xl p-3 leading-relaxed">
            <b class="text-amber-900">Reason:</b> "${escapeHtml(r.reason || 'None provided')}"
          </p>
          ${snapshotHtml}
        </div>

        <div class="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Requested by: <b class="text-slate-700">${escapeHtml(r.requested_by_name || 'Staff')}</b> 
            <span class="text-slate-400">(${escapeHtml(r.requested_by_email || '')})</span>
          </div>
          ${r.reviewed_at ? `
            <div class="text-slate-500">
              Reviewed by: <b class="text-slate-700">${escapeHtml(r.reviewed_by_name || 'Super Admin')}</b> on ${new Date(r.reviewed_at).toLocaleDateString()}
              ${r.review_notes ? `<span class="italic text-slate-400">("${escapeHtml(r.review_notes)}")</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function approveDeleteRequest(requestId) {
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only authenticated Super Admin can approve deletion requests.', 'error');
    return;
  }

  const req = (state.deleteRequests || []).find(r => r.id === requestId);
  if (!req) return;

  if (req.status !== 'PENDING') {
    showToast(`This request has already been ${req.status.toLowerCase()}.`, 'warning');
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Approve & Permanently Delete Record?',
    message: `Are you sure you want to approve deletion for "${req.record_title}"? This will permanently delete the record from the database.`,
    confirmText: 'Approve & Delete',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗑️'
  });
  if (!confirmed) return;

  const btn = document.querySelector(`[data-action-approve="${requestId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Deleting...</span>`;
  }

  const client = getSupabaseClient();
  let rpcSuccess = false;

  // 1. Attempt secure server-side RPC procedure (atomic delete + status update in PostgreSQL)
  if (client) {
    try {
      const { data, error } = await client.rpc('approve_delete_request', { p_request_id: requestId });
      if (!error && data?.success) {
        rpcSuccess = true;
      } else if (error) {
        console.warn('RPC approve_delete_request fallback to direct delete:', error.message);
      }
    } catch (e) {
      console.warn('RPC exception:', e);
    }
  }

  // 2. Direct fallback if RPC procedure is not yet created in Supabase
  if (!rpcSuccess) {
    if (req.record_type === 'DEVOTEE') {
      try {
        if (client) await client.from('devotees').delete().eq('DEVOTEE ID', req.record_id);
      } catch (e) {}
    } else if (req.record_type === 'PARCEL') {
      try {
        if (client) await client.from('parcels').delete().eq('id', req.record_id);
      } catch (e) {}
    }

    try {
      if (client) {
        await client.from('delete_requests').update({
          status: 'APPROVED',
          reviewed_by_id: currentUser?.id || null,
          reviewed_by_name: getUserDisplayName(currentUser),
          reviewed_by_email: currentUser?.email || 'admin@iskcon.org',
          reviewed_at: new Date().toISOString()
        }).eq('id', requestId);
      }
    } catch (e) {}
  }

  // 3. Remove from client local memory & storage
  if (req.record_type === 'DEVOTEE') {
    const devId = req.record_id;
    markDevoteesAsDeleted(devId);
    const devParcels = (state.parcels || []).filter(p => String(p.devoteeId) === String(devId));
    if (devParcels.length > 0) {
      markParcelsAsDeleted(devParcels.map(p => p.id));
    }
    state.devotees = (state.devotees || []).filter(d => String(d.id) !== String(devId));
    state.parcels = (state.parcels || []).filter(p => String(p.devoteeId) !== String(devId));
    if (state.selectedDevotees) state.selectedDevotees.delete(devId);
    if (state.selectedCelebrations) state.selectedCelebrations.delete(devId);
    saveToStorage();
    updateDevoteeAutocompleteList();
    updateKPIs();
    renderDevoteesTable();
    renderBirthdaysGrid();
    renderParcelsTable();
  } else if (req.record_type === 'PARCEL') {
    const parcelId = req.record_id;
    markParcelsAsDeleted(parcelId);
    state.parcels = (state.parcels || []).filter(p => String(p.id) !== String(parcelId));
    if (state.selectedParcels) state.selectedParcels.delete(parcelId);
    saveToStorage();
    updateKPIs();
    renderParcelsTable();
    renderBirthdaysGrid();
  }

  req.status = 'APPROVED';
  req.reviewed_by_id = currentUser?.id || null;
  req.reviewed_by_name = getUserDisplayName(currentUser);
  req.reviewed_by_email = currentUser?.email || 'admin@iskcon.org';
  req.reviewed_at = new Date().toISOString();

  recordAuditEvent({
    action: 'approve_delete',
    module: (req.record_type || 'DEVOTEE').toLowerCase(),
    recordId: req.record_id,
    summary: `Super Admin approved deletion of "${req.record_title}" (requested by ${req.requested_by_name || 'Staff'}).`,
    result: 'SUCCESS',
    oldValues: req.record_details || null,
    details: { requestId: req.id, reason: req.reason, requestedBy: req.requested_by_email }
  });
  showToast(`Request approved! "${req.record_title}" deleted permanently.`, 'success');
  updateRequestsNavBadge();
  renderDeleteRequests();
}

async function rejectDeleteRequest(requestId) {
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only authenticated Super Admin can review deletion requests.', 'error');
    return;
  }

  const req = (state.deleteRequests || []).find(r => r.id === requestId);
  if (!req) return;

  if (req.status !== 'PENDING') {
    showToast(`This request has already been ${req.status.toLowerCase()}.`, 'warning');
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Reject Deletion Request?',
    message: `Reject deletion of "${req.record_title}"? The record will remain completely safe and preserved in the database.`,
    confirmText: 'Reject Request',
    cancelText: 'Cancel',
    isDanger: false,
    icon: '🛡️'
  });
  if (!confirmed) return;

  const btn = document.querySelector(`[data-action-reject="${requestId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Rejecting...</span>`;
  }

  const client = getSupabaseClient();
  let rpcSuccess = false;

  // 1. Attempt server-side RPC procedure
  if (client) {
    try {
      const { data, error } = await client.rpc('reject_delete_request', { p_request_id: requestId });
      if (!error && data?.success) {
        rpcSuccess = true;
      } else if (error) {
        console.warn('RPC reject_delete_request fallback to direct update:', error.message);
      }
    } catch (e) {}
  }

  // 2. Direct fallback
  if (!rpcSuccess) {
    try {
      if (client) {
        await client.from('delete_requests').update({
          status: 'REJECTED',
          reviewed_by_id: currentUser?.id || null,
          reviewed_by_name: getUserDisplayName(currentUser),
          reviewed_by_email: currentUser?.email || 'admin@iskcon.org',
          reviewed_at: new Date().toISOString()
        }).eq('id', requestId);
      }
    } catch (e) {}
  }

  // Original record remains COMPLETELY PRESERVED AND UNTOUCHED
  req.status = 'REJECTED';
  req.reviewed_by_id = currentUser?.id || null;
  req.reviewed_by_name = getUserDisplayName(currentUser);
  req.reviewed_by_email = currentUser?.email || 'admin@iskcon.org';
  req.reviewed_at = new Date().toISOString();

  recordAuditEvent({
    action: 'reject_delete',
    module: (req.record_type || 'DEVOTEE').toLowerCase(),
    recordId: req.record_id,
    summary: `Super Admin rejected deletion request for "${req.record_title}". Record preserved.`,
    result: 'SUCCESS',
    details: { requestId: req.id, reason: req.reason, requestedBy: req.requested_by_email }
  });
  showToast(`Deletion request rejected. Record remains preserved.`, 'info');
  updateRequestsNavBadge();
  renderDeleteRequests();
}

async function clearDeleteRequests() {
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only authenticated Super Admin can clear delete requests history.', 'error');
    return;
  }

  const allReqs = state.deleteRequests || [];
  if (allReqs.length === 0) {
    showToast('No deletion requests found to clear.', 'info');
    return;
  }

  const processed = allReqs.filter(r => r.status === 'APPROVED' || r.status === 'REJECTED');
  const pending = allReqs.filter(r => r.status === 'PENDING');

  if (processed.length === 0 && pending.length > 0) {
    showToast('There are no processed (Approved/Rejected) requests to clear. Pending requests require Super Admin review.', 'warning');
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Clear Processed Delete Requests History?',
    message: `Are you sure you want to clear ${processed.length} processed (Approved/Rejected) request record(s) from history? Any pending requests (${pending.length}) will remain safe for review.`,
    confirmText: 'Clear History',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗑️'
  });
  if (!confirmed) return;

  const btn = document.getElementById('btn-clear-delete-requests');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }

  try {
    const idsToClear = processed.map(r => r.id);
    const client = getSupabaseClient();
    if (client && idsToClear.length > 0) {
      const { error } = await client.from('delete_requests').delete().in('id', idsToClear);
      if (error) {
        console.warn('Error clearing delete requests from Supabase:', error);
        showToast('Error clearing requests from cloud: ' + (error.message || 'Check database permissions.'), 'error');
        return;
      }
    }

    state.deleteRequests = pending;
    recordAuditEvent({
      action: 'clear',
      module: 'delete_requests',
      summary: `Super Admin cleared ${idsToClear.length} processed deletion requests from history.`,
      result: 'SUCCESS'
    });
    showToast(`✅ Successfully cleared ${idsToClear.length} processed deletion request(s).`, 'success');
    updateRequestsNavBadge();
    renderDeleteRequests();
  } catch (err) {
    console.error('clearDeleteRequests error:', err);
    showToast('Failed to clear delete requests.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

// Global exposure
window.openDeleteRequestModal = openDeleteRequestModal;
window.closeDeleteRequestModal = closeDeleteRequestModal;
window.handleDeleteRequestSubmit = handleDeleteRequestSubmit;
window.fetchDeleteRequests = fetchDeleteRequests;
window.subscribeToDeleteRequests = subscribeToDeleteRequests;
window.unsubscribeFromDeleteRequests = unsubscribeFromDeleteRequests;
window.filterDeleteRequests = filterDeleteRequests;
window.approveDeleteRequest = approveDeleteRequest;
window.rejectDeleteRequest = rejectDeleteRequest;
window.clearDeleteRequests = clearDeleteRequests;

// ======================================================================
// 👑 STAFF & ROLE-BASED ACCESS CONTROL (RBAC) MANAGEMENT
// ======================================================================

state.staffList = [];

function updateStaffNavBadge() {
  const badge = document.getElementById('nav-roles-badge');
  if (!badge) return;
  const count = (state.staffList || []).length;
  badge.innerText = count;
  badge.classList.toggle('hidden', count === 0);
}

function updateStaffKPIs() {
  const list = state.staffList || [];
  const superAdminCount = list.filter(u => u.role === 'SUPER_ADMIN').length;
  const adminCount = list.filter(u => u.role === 'ADMIN').length;
  const staffCount = list.filter(u => u.role === 'STAFF').length;
  const viewerCount = list.filter(u => u.role === 'VIEWER' || u.role === 'USER').length;

  const elSuper = document.getElementById('roles-kpi-super-admin');
  if (elSuper) elSuper.innerText = superAdminCount;

  const elAdmin = document.getElementById('roles-kpi-admin');
  if (elAdmin) elAdmin.innerText = adminCount;

  const elStaff = document.getElementById('roles-kpi-staff');
  if (elStaff) elStaff.innerText = staffCount;

  const elViewer = document.getElementById('roles-kpi-viewer');
  if (elViewer) elViewer.innerText = viewerCount;

  const countEl = document.getElementById('staff-table-count');
  if (countEl) countEl.innerText = `${list.length} Sevak${list.length === 1 ? '' : 's'}`;

  updateStaffNavBadge();
}

async function loadStaffListFromCloud(forceToast = false) {
  const client = getSupabaseClient();
  let staffData = [];

  if (client) {
    try {
      // 1. Try user_profiles table
      let { data, error } = await client
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) {
        // 2. Fallback to profiles table
        const pRes = await client.from('profiles').select('*');
        if (!pRes.error && pRes.data && pRes.data.length > 0) {
          data = pRes.data;
        }
      }

      if (data && data.length > 0) {
        staffData = data.map(u => {
          let assignedWork = ['devotees', 'birthdays', 'anniversaries', 'parcels'];
          if (Array.isArray(u.assigned_work) && u.assigned_work.length > 0) {
            assignedWork = u.assigned_work;
          } else if (typeof u.assigned_work === 'string' && u.assigned_work.startsWith('[')) {
            try { assignedWork = JSON.parse(u.assigned_work); } catch (e) {}
          }
          return {
            id: u.id,
            email: u.email || 'N/A',
            fullName: u.full_name || (u.email ? u.email.split('@')[0] : 'Sevak'),
            role: String(u.role || 'STAFF').toUpperCase(),
            division: u.division || 'Devotee Care',
            assignedWork: assignedWork,
            createdAt: u.created_at || new Date().toISOString(),
            status: 'Active'
          };
        });
      }
    } catch (e) {
      console.warn('Error fetching staff list from Supabase:', e);
    }
  }

  // Ensure default/current user is represented if empty or offline
  if (staffData.length === 0) {
    const curEmail = (currentUser && currentUser.email) || 'admin@iskcon.org';
    const curName = (currentUserProfile && currentUserProfile.full_name) || 'Rathin Roy Prabhu';
    const curRole = getActiveRoleKey() || 'SUPER_ADMIN';

    staffData = [
      {
        id: (currentUser && currentUser.id) || 'usr_super_admin',
        email: curEmail,
        fullName: curName,
        role: curRole,
        division: 'All',
        assignedWork: ['devotees', 'birthdays', 'anniversaries', 'parcels'],
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'Active'
      },
      {
        id: 'usr_staff_01',
        email: 'devoteecare.staff@iskcon.org',
        fullName: 'Devotee Care Sevak',
        role: 'STAFF',
        division: 'Congregation Care',
        assignedWork: ['birthdays', 'parcels'],
        createdAt: '2026-02-15T00:00:00.000Z',
        status: 'Active'
      },
      {
        id: 'usr_viewer_01',
        email: 'congregation.viewer@iskcon.org',
        fullName: 'Congregation Visitor',
        role: 'VIEWER',
        division: 'General',
        assignedWork: ['devotees', 'birthdays', 'anniversaries', 'parcels'],
        createdAt: '2026-03-01T00:00:00.000Z',
        status: 'Active'
      }
    ];
  }

  // Merge any local additions if cached
  try {
    const cached = JSON.parse(localStorage.getItem('iskcon_staff_list_cache') || '[]');
    if (Array.isArray(cached) && cached.length > 0) {
      cached.forEach(c => {
        if (!staffData.some(s => s.email === c.email || (s.id && s.id === c.id))) {
          staffData.push(c);
        }
      });
    }
  } catch (e) {}

  state.staffList = staffData;
  renderStaffTable();
  updateStaffKPIs();

  if (forceToast) {
    showToast(`✅ Staff list refreshed (${staffData.length} sevaks loaded)`, 'success');
  }
}

function renderStaffTable(listToRender) {
  const tbody = document.getElementById('staff-table-body');
  const emptyState = document.getElementById('staff-empty-state');
  if (!tbody) return;

  const list = listToRender || state.staffList || [];

  if (list.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  const canEditRoles = isSuperAdmin();

  const roleMeta = {
    SUPER_ADMIN: { label: 'Super Admin', icon: '👑', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
    ADMIN: { label: 'Admin', icon: '🛡️', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
    STAFF: { label: 'Staff', icon: '🛠️', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    USER: { label: 'User', icon: '👤', badge: 'bg-teal-100 text-teal-800 border-teal-300' },
    VIEWER: { label: 'Viewer', icon: '👁️', badge: 'bg-sky-100 text-sky-800 border-sky-300' }
  };

  tbody.innerHTML = list.map((u, idx) => {
    const serialNo = idx + 1;
    const rKey = (u.role || 'STAFF').toUpperCase();
    const meta = roleMeta[rKey] || roleMeta.STAFF;
    const initial = (u.fullName || u.email || 'S').trim().charAt(0).toUpperCase();
    const joinedStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Active';
    const isTargetSuperAdmin = (rKey === 'SUPER_ADMIN');

    // Assigned Work / Seva Badges
    let workContent = '';
    if (isTargetSuperAdmin) {
      workContent = `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10.5px] font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs select-none"><span>👑</span><span>Full Access (All Sevas)</span></span>`;
    } else if (rKey === 'ADMIN') {
      workContent = `<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs select-none"><span>🛡️</span><span>All Operations</span></span>`;
    } else if (rKey === 'STAFF') {
      const assigned = (Array.isArray(u.assignedWork) && u.assignedWork.length > 0)
        ? u.assignedWork
        : ['devotees', 'birthdays', 'anniversaries', 'parcels'];
      const badges = [];
      if (assigned.includes('devotees')) badges.push(`<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs" title="Devotee Directory">👥 Directory</span>`);
      if (assigned.includes('birthdays')) badges.push(`<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs" title="Birthday Wishes">🎂 Birthday</span>`);
      if (assigned.includes('anniversaries')) badges.push(`<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs" title="Anniversary Wishes">💍 Anniv</span>`);
      if (assigned.includes('parcels')) badges.push(`<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs" title="Parcel Tracking">📦 Parcels</span>`);
      workContent = `<div class="flex flex-wrap gap-1 max-w-[220px]">${badges.length > 0 ? badges.join('') : '<span class="text-[10px] text-slate-400 italic">No seva assigned</span>'}</div>`;
    } else {
      workContent = `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"><span>👁️</span><span>Read-Only</span></span>`;
    }

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3 px-3 text-center">
          <span class="font-bold text-slate-400 font-mono">${serialNo}</span>
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
              ${initial}
            </div>
            <div>
              <div class="font-bold text-slate-900 text-xs">${escapeHtml(u.fullName || 'Sevak')}</div>
              <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(u.email || '')}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-3 whitespace-nowrap">
          <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.badge} shadow-xs">
            <span>${meta.icon}</span>
            <span>${meta.label}</span>
          </span>
        </td>
        <td class="py-3 px-3">
          ${workContent}
        </td>
        <td class="py-3 px-3 whitespace-nowrap text-xs font-medium text-slate-600">
          📍 ${escapeHtml(u.division || 'Devotee Care')}
        </td>
        <td class="py-3 px-3 whitespace-nowrap">
          <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Active</span>
          </span>
          <div class="text-[9.5px] text-slate-400 mt-0.5">${joinedStr}</div>
        </td>
        <td class="py-3 px-4 text-right whitespace-nowrap">
          ${isTargetSuperAdmin ? `
            <!-- 🔒 SUPER ADMIN PERMANENT LOCK: No edit dropdown, no edit block! -->
            <span class="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-xs select-none" title="Super Admin account is permanently locked against editing or demoting">
              <span>🔒</span>
              <span>Super Admin (Locked / Permanent)</span>
            </span>
          ` : (canEditRoles ? `
            <div class="inline-flex items-center space-x-2">
              <select onchange="updateStaffRole('${escapeHtml(u.id || u.email)}', this.value)" title="Change Role"
                class="px-2 py-1 text-[11px] font-semibold border border-purple-200 rounded-lg bg-purple-50/40 text-purple-900 focus:ring-2 focus:ring-purple-400 cursor-pointer">
                <option value="ADMIN" ${rKey === 'ADMIN' ? 'selected' : ''}>🛡️ Admin</option>
                <option value="STAFF" ${rKey === 'STAFF' ? 'selected' : ''}>🛠️ Staff</option>
                <option value="VIEWER" ${rKey === 'VIEWER' || rKey === 'USER' ? 'selected' : ''}>👁️ Viewer</option>
              </select>
              <button type="button" onclick="openAssignWorkModal('${escapeHtml(u.id || u.email)}')"
                class="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition shadow-2xs cursor-pointer"
                title="Assign Seva / Work Modules">
                <span>🛠️</span>
                <span>Assign Work</span>
              </button>
            </div>
          ` : `
            <span class="text-[11px] text-slate-400 italic">Protected (Super Admin only)</span>
          `)}
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function filterStaffTable() {
  const query = (document.getElementById('staff-search-input')?.value || '').trim().toLowerCase();
  if (!query) {
    renderStaffTable();
    return;
  }
  const filtered = (state.staffList || []).filter(u => {
    return (u.fullName || '').toLowerCase().includes(query) ||
           (u.email || '').toLowerCase().includes(query) ||
           (u.role || '').toLowerCase().includes(query) ||
           (u.division || '').toLowerCase().includes(query);
  });
  renderStaffTable(filtered);
}

async function updateStaffRole(userIdOrEmail, newRole) {
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only Super Admin can change staff roles.', 'error');
    renderStaffTable();
    return;
  }

  const staff = (state.staffList || []).find(s => s.id === userIdOrEmail || s.email === userIdOrEmail);
  if (!staff) return;

  // 🔒 CRITICAL GUARD: Super Admin is permanently locked!
  if (String(staff.role).toUpperCase() === 'SUPER_ADMIN') {
    showToast('🔒 Protection Guard: Super Admin account is permanently locked and cannot be edited or demoted.', 'error');
    renderStaffTable();
    return;
  }

  if (newRole === 'SUPER_ADMIN') {
    showToast('🔒 Super Admin is permanent and unique. Role cannot be elevated to Super Admin.', 'error');
    renderStaffTable();
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Confirm Role Change',
    message: `Are you sure you want to change the role of "${staff.fullName || staff.email}" to ${newRole}?`,
    confirmText: 'Change Role',
    cancelText: 'Cancel',
    icon: '👑',
    isDanger: false
  });
  if (!confirmed) {
    renderStaffTable();
    return;
  }

  const prevRole = staff.role;
  staff.role = newRole;

  // Persist locally
  try {
    localStorage.setItem('iskcon_staff_list_cache', JSON.stringify(state.staffList));
  } catch (e) {}

  // Update in Supabase
  const client = getSupabaseClient();
  if (client) {
    try {
      if (staff.id && staff.id.length > 10) {
        await client.from('user_profiles').update({ role: newRole }).eq('id', staff.id);
        await client.from('profiles').update({ role: newRole }).eq('id', staff.id);
      } else if (staff.email) {
        await client.from('user_profiles').update({ role: newRole }).eq('email', staff.email);
        await client.from('profiles').update({ role: newRole }).eq('email', staff.email);
      }
    } catch (e) {
      console.warn('Cloud role update notice:', e);
    }
  }

  logActivity('edit', 'Role', `Super Admin updated role of "${staff.fullName || staff.email}" from ${prevRole} to ${newRole}`);
  showToast(`✅ Role for "${staff.fullName || staff.email}" updated to ${newRole}!`, 'success');
  renderStaffTable();
  updateStaffKPIs();
}

function openAssignWorkModal(userIdOrEmail) {
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only Super Admin can assign seva modules.', 'error');
    return;
  }
  const staff = (state.staffList || []).find(s => s.id === userIdOrEmail || s.email === userIdOrEmail);
  if (!staff) {
    showToast('Staff record not found.', 'error');
    return;
  }
  if (String(staff.role).toUpperCase() === 'SUPER_ADMIN') {
    showToast('🔒 Super Admin is permanently assigned full access to all modules.', 'info');
    return;
  }

  const targetIdInput = document.getElementById('assign-work-target-id');
  const nameEl = document.getElementById('assign-work-staff-name');
  const emailEl = document.getElementById('assign-work-staff-email');
  const avatarEl = document.getElementById('assign-work-avatar');
  const roleEl = document.getElementById('assign-work-staff-role');
  const subTitleEl = document.getElementById('assign-work-modal-subtitle');

  if (targetIdInput) targetIdInput.value = staff.id || staff.email;
  if (nameEl) nameEl.innerText = staff.fullName || 'Sevak';
  if (emailEl) emailEl.innerText = staff.email || 'N/A';
  if (avatarEl) avatarEl.innerText = (staff.fullName || staff.email || 'S').trim().charAt(0).toUpperCase();
  if (roleEl) roleEl.innerText = (staff.role || 'STAFF');
  if (subTitleEl) subTitleEl.innerText = `Configure module permissions for ${staff.fullName || staff.email}`;

  const currentWork = (Array.isArray(staff.assignedWork) && staff.assignedWork.length > 0)
    ? staff.assignedWork
    : ['devotees', 'birthdays', 'anniversaries', 'parcels'];

  document.querySelectorAll('input[name="assignedWorkModule"]').forEach(cb => {
    cb.checked = currentWork.includes(cb.value);
  });

  const modal = document.getElementById('assign-work-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeAssignWorkModal() {
  const modal = document.getElementById('assign-work-modal');
  if (modal) modal.classList.add('hidden');
}

function toggleAllWorkCheckboxes(checked) {
  document.querySelectorAll('input[name="assignedWorkModule"]').forEach(cb => {
    cb.checked = !!checked;
  });
}

async function handleSaveWorkAssignment(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only Super Admin can assign work modules.', 'error');
    return;
  }

  const targetId = document.getElementById('assign-work-target-id')?.value;
  if (!targetId) return;

  const staff = (state.staffList || []).find(s => s.id === targetId || s.email === targetId);
  if (!staff) {
    showToast('Staff member not found.', 'error');
    return;
  }

  const selected = [];
  document.querySelectorAll('input[name="assignedWorkModule"]:checked').forEach(cb => {
    selected.push(cb.value);
  });

  if (selected.length === 0) {
    showToast('⚠️ Please select at least one module for this staff member.', 'error');
    return;
  }

  staff.assignedWork = selected;

  // Persist locally
  try {
    localStorage.setItem('iskcon_staff_list_cache', JSON.stringify(state.staffList));
  } catch (err) {}

  // Update cloud
  const client = getSupabaseClient();
  if (client) {
    try {
      if (staff.id && staff.id.length > 10) {
        await client.from('user_profiles').update({ assigned_work: selected }).eq('id', staff.id);
        await client.from('profiles').update({ assigned_work: selected }).eq('id', staff.id);
      } else if (staff.email) {
        await client.from('user_profiles').update({ assigned_work: selected }).eq('email', staff.email);
        await client.from('profiles').update({ assigned_work: selected }).eq('email', staff.email);
      }
    } catch (cloudErr) {
      console.warn('Could not update assigned_work on Supabase:', cloudErr);
    }
  }

  // If the updated user is currently logged in, update currentUserProfile immediately
  if (currentUser && (currentUser.id === staff.id || currentUser.email === staff.email)) {
    if (currentUserProfile) {
      currentUserProfile.assigned_work = selected;
    }
    enforceRoleUI();
  }

  const moduleNames = {
    devotees: 'Devotee Directory',
    birthdays: 'Birthday Wishes',
    anniversaries: 'Anniversary Wishes',
    parcels: 'Parcel Tracking'
  };
  const readableList = selected.map(m => moduleNames[m] || m).join(', ');

  logActivity('edit', 'Work Assignment', `Super Admin assigned seva modules [${readableList}] to "${staff.fullName || staff.email}"`);
  showToast(`✅ Seva assigned to ${staff.fullName || staff.email}: ${readableList}`, 'success');
  closeAssignWorkModal();
  renderStaffTable();
}

function openAddStaffModal() {
  const modal = document.getElementById('add-staff-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAddStaffModal() {
  const modal = document.getElementById('add-staff-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleCreateStaffSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('new-staff-name').value.trim();
  const email = document.getElementById('new-staff-email').value.trim().toLowerCase();
  const password = document.getElementById('new-staff-password').value;
  const role = document.getElementById('new-staff-role').value;
  const division = document.getElementById('new-staff-division').value;
  const submitBtn = document.getElementById('new-staff-submit-btn');

  if (!email || !password || password.length < 6) {
    showToast('Please enter a valid email and minimum 6-character password.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> Creating Account...';
  }

  const client = getSupabaseClient();
  let createdId = `usr_${Date.now()}`;
  const defaultWork = ['devotees', 'birthdays', 'anniversaries', 'parcels'];

  if (client) {
    try {
      const { data, error } = await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: name,
            role: role,
            division: division
          }
        }
      });

      if (error) {
        console.warn('Supabase auth signUp error:', error);
        // Fallback: upsert directly to user_profiles table
        await client.from('user_profiles').upsert({
          email: email,
          full_name: name,
          role: role,
          division: division,
          assigned_work: defaultWork
        }, { onConflict: 'email' });
      } else if (data && data.user) {
        createdId = data.user.id;
      }
    } catch (err) {
      console.warn('Staff creation exception:', err);
    }
  }

  const newStaffObj = {
    id: createdId,
    email: email,
    fullName: name,
    role: role,
    division: division,
    assignedWork: defaultWork,
    createdAt: new Date().toISOString(),
    status: 'Active'
  };

  if (!state.staffList) state.staffList = [];
  state.staffList.unshift(newStaffObj);

  try {
    localStorage.setItem('iskcon_staff_list_cache', JSON.stringify(state.staffList));
  } catch (e) {}

  logActivity('add', 'Staff', `Created new staff account: ${name} (${email}) as ${role}`);
  showToast(`👑 Staff account for "${name}" created successfully as ${role}!`, 'success');

  closeAddStaffModal();
  renderStaffTable();
  updateStaffKPIs();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="user-plus" class="w-3.5 h-3.5"></i><span>Create Staff Account</span>';
    if (window.lucide) lucide.createIcons();
  }
}

// Global exposure for staff functions
window.loadStaffListFromCloud = loadStaffListFromCloud;
window.renderStaffTable = renderStaffTable;
window.filterStaffTable = filterStaffTable;
window.updateStaffRole = updateStaffRole;
window.openAssignWorkModal = openAssignWorkModal;
window.closeAssignWorkModal = closeAssignWorkModal;
window.toggleAllWorkCheckboxes = toggleAllWorkCheckboxes;
window.handleSaveWorkAssignment = handleSaveWorkAssignment;
window.openAddStaffModal = openAddStaffModal;
window.closeAddStaffModal = closeAddStaffModal;
window.handleCreateStaffSubmit = handleCreateStaffSubmit;

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  const icon = btnEl.querySelector('i');
  if (icon) {
    icon.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
    if (window.lucide) lucide.createIcons();
  }
}

function formatAuthErrorMessage(error) {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = (error.message || error.toString() || '').toLowerCase();
  
  if (msg.includes('invalid login credentials') || msg.includes('invalid grant') || msg.includes('wrong password')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Your email address has not been confirmed yet. Please confirm it in your inbox or ask your administrator.';
  }
  if (msg.includes('user not found')) {
    return 'No registered account found with this email. Please check the spelling or contact your administrator.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many login attempts. Please wait a few moments before trying again.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  if (msg.includes('password should be at least')) {
    return 'Password must be at least 6 characters long.';
  }
  return error.message || 'Authentication error. Please try again.';
}

function showAuthAlert(message, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  const alertText = document.getElementById('auth-alert-text');
  const alertIcon = document.getElementById('auth-alert-icon');
  if (!alertEl || !alertText) return;

  alertText.innerText = message;
  alertEl.className = 'mb-4 text-xs p-3.5 rounded-xl border flex items-start space-x-2.5 transition-all ' + 
    (type === 'error' 
      ? 'bg-rose-950/60 border-rose-800/80 text-rose-200' 
      : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200');

  if (alertIcon) {
    alertIcon.setAttribute('data-lucide', type === 'error' ? 'alert-circle' : 'check-circle-2');
  }
  alertEl.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function clearAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) alertEl.classList.add('hidden');
}

// ----------------------------------------------------
// LOGIN PAGE — ONE single sign-in window
// ----------------------------------------------------
// Any registered Supabase account may sign in here; the account's role decides
// which panel opens afterwards. This field is kept for deep links / route guard
// only — it is always null now.
let authDoor = null;

// True while the visitor arrived through a password-reset ("recovery") link.
// Used so a recovery session opens the "Set New Password" window instead of
// dropping the visitor straight into the dashboard.
let pendingPasswordRecovery = false;

// ⚠️ Snapshot the auth markers in the URL the moment portal.js loads.
// The Supabase client can consume (and strip) the `#access_token=…&type=recovery`
// hash as soon as it initialises — reading the URL only later, at
// DOMContentLoaded, is exactly what used to make the emailed reset link fall
// back to the plain login screen instead of opening the "Set New Password" form.
const INITIAL_AUTH_URL = (() => {
  try {
    return { hash: window.location.hash || '', search: window.location.search || '' };
  } catch (e) {
    return { hash: '', search: '' };
  }
})();

// Parse recovery/token/error markers out of a #hash and/or ?query pair.
function findAuthUrlMarkers(hash, search) {
  const query = (search || '').replace(/^\?/, '');
  const raw = `${hash || ''}${query ? '&' + query : ''}`;
  const get = (name) => {
    const m = raw.match(new RegExp('[#&]' + name + '=([^&#]*)', 'i'));
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  };
  return {
    errorCode: get('error_code') || get('error'),
    errorDescription: get('error_description'),
    isRecovery:
      /type=recovery/i.test(raw) ||   // implicit flow: #access_token=…&type=recovery
      /access_token=/i.test(raw) ||   // token pair without an explicit type
      /[#&?]code=/.test(`&${raw}`)    // PKCE flow: ?code=…
  };
}

// Remove tokens / errors from the address bar while keeping ?panel= intact.
function clearAuthUrlMarkers() {
  try {
    if (!window.history || !window.history.replaceState) return;
    const url = new URL(window.location.href);
    url.hash = '';
    ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type',
     'type', 'code', 'error', 'error_code', 'error_description'].forEach(k => url.searchParams.delete(k));
    window.history.replaceState(null, '', url.toString());
    INITIAL_AUTH_URL.hash = '';
    INITIAL_AUTH_URL.search = url.search;
  } catch (e) { /* ignore malformed URLs */ }
}

// ----------------------------------------------------
// 🔐 PUBLIC MODES — kept as an emergency switch
// ----------------------------------------------------
// Two switchable public modes, checked in this order:
//
//   1. PUBLIC_OPEN_ACCESS → the WHOLE site opens for everyone, NO login at all.
//   2. PUBLIC_LANDING_MODE → a clean "Get Started" landing + welcome page only.
//
// Both are OFF so the real login / role system is active. Set EITHER back to
// true only as a temporary measure while Supabase is being set up — then turn
// it off again. Nothing else needs to change: the login doors, forms, role
// rules and URL route guard are all present and untouched.
//
// ⚠️ Heads-up: OPEN ACCESS shows every dashboard, the devotee directory and all
// records to ANY visitor. Use it only while the site is not yet public.
// ✅ REAL WORKFLOW IS ON — the portal now follows the 4-step Architecture Flow:
//   1. Admin & Staff sign in with individual accounts
//   2. Supabase Authentication & RLS verify identity + permissions
//   3. Supabase PostgreSQL stores devotees, parcels, and audit history
//   4. Live Admin Dashboard reads the cloud data in real time
//
// Both public bypasses are OFF so the login gate + role system are active.
const PUBLIC_OPEN_ACCESS = false;
const PUBLIC_LANDING_MODE = false; // only used when OPEN ACCESS is off

// 🔒 STRICT AUTHENTICATION ENFORCED: No public or preview bypass allowed.
function enterPublicPortal() {
  console.warn('⛔ enterPublicPortal disabled. Mandatory authentication required.');
  showAuthScreen();
}

// Local preview bypass permanently disabled
function isLocalHost() {
  return false;
}

// Show the public landing (Get Started) view and keep the login UI hidden.
function showLandingView() {
  hideAccessDenied();
  clearAuthAlert();
  const landing  = document.getElementById('landing-view');
  const welcome  = document.getElementById('welcome-view');
  const choice   = document.getElementById('auth-door-choice');
  const formView = document.getElementById('auth-form-view');
  const alertEl  = document.getElementById('auth-alert');
  if (landing)  landing.classList.remove('hidden');
  if (welcome)  welcome.classList.add('hidden');
  if (choice)   choice.classList.add('hidden');
  if (formView) formView.classList.add('hidden');
  if (alertEl)  alertEl.classList.add('hidden');
  setPanelUrl(null);
  if (window.lucide) lucide.createIcons();
}

// Get Started → simple public welcome page (no portal, no data, no admin).
function openWelcomePage() {
  clearAuthAlert();
  hideAccessDenied();
  const landing = document.getElementById('landing-view');
  const welcome = document.getElementById('welcome-view');
  if (landing) landing.classList.add('hidden');
  if (welcome) welcome.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

// Back to the landing view.
function closeWelcomePage() {
  showLandingView();
}

// 🔒 Offline preview bypass permanently disabled: Valid Email ID and Password required.
function enterPortalPreview() {
  console.warn('⛔ Offline preview bypass disabled. Valid Email ID and Password required.');
  showAuthScreen();
}

function renderPreviewChip() {
  // Preview chip disabled
}

function refreshLocalPreviewUI() {
  const wrap = document.getElementById('local-preview-wrap');
  if (wrap) wrap.classList.add('hidden');
}

// ----------------------------------------------------
// URL ROUTE GUARD — separate Admin URL vs User URL
//   ?panel=admin  → Admin login / Admin portal only
//   ?panel=user   → User login  / User portal only
//   (a #/admin or #/user hash is accepted too)
// ----------------------------------------------------
function getPanelFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get('panel');
    if (p) {
      const v = p.trim().toUpperCase();
      if (v === 'ADMIN' || v === 'USER') return v;
    }
    const h = (window.location.hash || '').replace(/^#\/?/, '').trim().toUpperCase();
    if (h === 'ADMIN' || h === 'USER') return h;
  } catch (e) { /* ignore malformed URLs */ }
  return null;
}

// Keep the browser URL in sync with the panel (no reload)
function setPanelUrl(panel) {
  try {
    if (!window.history || !window.history.replaceState) return;
    const url = new URL(window.location.href);
    if (panel === 'ADMIN' || panel === 'USER') url.searchParams.set('panel', panel.toLowerCase());
    else url.searchParams.delete('panel');
    window.history.replaceState(null, '', url.toString());
  } catch (e) { /* ignore */ }
}

// Decision for the URL that was opened: 'ENTER' | 'DENIED' | 'REDIRECT'
function applyRouteGuard(panel) {
  if (!panel) return 'ENTER'; // plain portal URL — the role's own panel decides
  const adminish = ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(getActiveRoleKey());
  if (panel === 'ADMIN') return adminish ? 'ENTER' : 'DENIED';
  return adminish ? 'REDIRECT' : 'ENTER'; // ?panel=user — admins go to their own Admin URL
}

function hideAccessDenied() {
  const box = document.getElementById('access-denied-box');
  if (box) box.classList.add('hidden');
}

function showAccessDenied(panel, roleKey) {
  const box = document.getElementById('access-denied-box');
  const msg = document.getElementById('access-denied-msg');
  const label = (USER_ROLES[roleKey] || USER_ROLES.ADMIN).label;
  const isAdminUrl = panel === 'ADMIN';
  if (msg) {
    const setupHint = currentUserProfile ? '' :
      ' ⚠️ Roles are not set up yet (supabase-auth-setup.sql has not been run), so every login is treated as Admin.';
    msg.innerText =
      `⛔ This ${isAdminUrl ? 'Admin' : 'User'} URL ( ?panel=${String(panel).toLowerCase()} ) is reserved for ` +
      `${isAdminUrl ? 'Admin & Staff' : 'Sevak (User/Viewer)'} accounts. Your account has ${label} access.` +
      setupHint + ' Open your own portal below.';
  }
  if (box) box.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

// Used by the Access Denied card buttons — route the session to a panel
function goToPanel(panel) {
  panel = (panel === 'USER') ? 'USER' : (panel === 'ADMIN' ? 'ADMIN' : null);
  if (panel) setPanelUrl(panel); else setPanelUrl(null);
  hideAccessDenied();

  const adminish = ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(getActiveRoleKey());

  // A non-admin opening the Admin URL → Access Denied, straight back on the login page
  if (panel === 'ADMIN' && !adminish) {
    showAccessDenied('ADMIN', getActiveRoleKey());
    return;
  }
  // Spec: an Admin opening the User URL is redirected to their own Admin portal
  if (panel === 'USER' && adminish) setPanelUrl('ADMIN');

  if (currentUser) {
    // Session already valid → enter the matching portal directly, no re-login
    (async () => {
      try {
        await showPortalDashboard(currentUser);
        await initSupabaseAndSync();
      } catch (e) { console.warn('Panel entry:', e); }
    })();
  } else {
    showSignInView();
    if (panel) setPanelUrl(panel);
  }
}

// Default view of the login page — the single sign-in form.
function showAuthDoorChoice() {
  showSignInView();
}

// Show the ONE sign-in window (no Admin/User doors).
function showSignInView() {
  authDoor = null;
  hideAccessDenied();
  hidePublicLandingViews();
  const choice = document.getElementById('auth-door-choice');
  const formView = document.getElementById('auth-form-view');
  if (choice) choice.classList.add('hidden');
  if (formView) formView.classList.remove('hidden');
  clearAuthAlert();
  if (window.lucide) lucide.createIcons();
}

// Hide the public landing / welcome views when the real login UI is shown
// (only reachable when PUBLIC_LANDING_MODE is turned off).
function hidePublicLandingViews() {
  const landing = document.getElementById('landing-view');
  const welcome = document.getElementById('welcome-view');
  if (landing) landing.classList.add('hidden');
  if (welcome) welcome.classList.add('hidden');
}

// Legacy name kept for existing onclick handlers / deep links — opens the
// single sign-in window and preserves the ?panel= deep link for the route guard.
function chooseAuthDoor(door) {
  const panel = (door === 'USER' || door === 'ADMIN') ? door : null;
  hideAccessDenied();
  if (panel) setPanelUrl(panel);
  showSignInView();
}

// After sign-in: always allowed — one window, any account, the role decides the panel.
function verifyAuthDoor() {
  return true;
}

// Generate, copy and share the direct login URL (?auth=login)
function copyLoginLink() {
  const loginUrl = `${window.location.origin}${window.location.pathname}?auth=login`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(loginUrl).then(() => {
      showToast('📋 Direct login link copied to clipboard: ' + loginUrl, 'success');
    }).catch(() => {
      prompt('Copy this direct login link to share with sevaks:', loginUrl);
    });
  } else {
    prompt('Copy this direct login link to share with sevaks:', loginUrl);
  }
}
window.copyLoginLink = copyLoginLink;

function showAuthScreen(backToChoice = true) {
  const authScreen = document.getElementById('auth-screen');
  const portalApp = document.getElementById('portal-app');
  if (authScreen) {
    authScreen.classList.remove('hidden');
    authScreen.style.removeProperty('display');
  }
  if (portalApp) {
    portalApp.classList.add('hidden');
    portalApp.style.setProperty('display', 'none', 'important');
  }

  const panelFromUrl = getPanelFromUrl();
  if (panelFromUrl) setPanelUrl(panelFromUrl);
  showSignInView();
  refreshLocalPreviewUI();
  updateAuthHeader(null);
  if (window.lucide) lucide.createIcons();
}

async function showPortalDashboard(user) {
  if (!user || !user.email) {
    console.warn('⛔ showPortalDashboard called without valid user. Mandatory login enforced.');
    showAuthScreen();
    return;
  }

  const authScreen = document.getElementById('auth-screen');
  const portalApp = document.getElementById('portal-app');
  if (authScreen) {
    authScreen.classList.add('hidden');
    authScreen.style.setProperty('display', 'none', 'important');
  }
  if (portalApp) {
    portalApp.classList.remove('hidden');
    portalApp.style.removeProperty('display');
  }

  // Resolve the role BEFORE the first header render so a fail-closed USER
  // account never flashes the Admin badge/tabs.
  if (user && !currentUserProfile) {
    try {
      await fetchUserProfile(user);
    } catch (e) {
      console.warn('Profile fetch handled:', e);
    }
  }

  // Render the portal data now that identity is confirmed
  renderAuthenticatedPortal();

  // 🛡️ STRICT ACTIVITY ISOLATION:
  // If not Super Admin, immediately prune local in-memory log so foreign activities are never exposed.
  if (!isSuperAdmin()) {
    const myId = user?.id;
    const myEmail = (user?.email || '').toLowerCase();
    state.activityLog = (state.activityLog || []).filter(e => {
      return (myId && e.userId === myId) || (myEmail && (e.staffEmail || '').toLowerCase() === myEmail);
    });
    persistActivityLog();
  }

  updateAuthHeader(user);
  if (user && user.email) enforceRoleUI();

  // Load Delete Requests and subscribe to Realtime updates for Admin & Super Admin
  if (isAdminOrSuper()) {
    fetchDeleteRequests(false);
    subscribeToDeleteRequests();
  }

  if (window.lucide) lucide.createIcons();
}

function updateAuthHeader(user) {
  const container = document.getElementById('auth-header-container');
  if (!container) return;

  if (user && user.email) {
    const roleKey = getUserRole(user);
    currentUserRole = roleKey;
    const roleConfig = USER_ROLES[roleKey] || USER_ROLES.ADMIN;
    const division = getUserDivision();
    const displayName = getUserDisplayName(user);
    const initial = displayName.charAt(0).toUpperCase();

    container.innerHTML = `
      <div class="flex items-center space-x-2">
        <!-- Minimalist User Profile Chip -->
        <div class="flex items-center space-x-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg px-2.5 py-1 transition cursor-pointer" onclick="openProfileModalSafe()" title="Signed in as ${user.email} (${roleConfig.label} • ${getActivePanel() === 'ADMIN' ? 'Admin Panel' : 'User Panel'})">
          <div class="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white font-semibold text-xs flex items-center justify-center shadow-xs shrink-0">
            ${initial}
          </div>
          <div class="hidden sm:flex items-center space-x-2 text-left">
            <span class="text-xs font-medium text-slate-200 truncate max-w-[120px]" title="${displayName}">${displayName}</span>
            <span class="text-[10px] font-medium px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">${roleConfig.label}</span>
          </div>
        </div>

        <!-- Copy Direct Login Link Button -->
        <button type="button" onclick="copyLoginLink()" class="hidden sm:flex items-center space-x-1.5 bg-white/[0.03] hover:bg-indigo-500/15 text-indigo-300 hover:text-white border border-white/[0.06] hover:border-indigo-500/30 font-medium px-2 py-1.5 rounded-lg transition text-xs cursor-pointer shadow-xs active:scale-95" title="Copy direct login link to share with staff">
          <i data-lucide="link" class="w-3.5 h-3.5 text-indigo-400"></i>
          <span class="hidden md:inline">Login Link</span>
        </button>

        <!-- Minimalist Logout Ghost Button -->
        <button onclick="handleAuthSignOut()" class="flex items-center space-x-1.5 bg-white/[0.03] hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 border border-white/[0.06] hover:border-rose-500/20 font-medium px-2.5 py-1.5 rounded-lg transition text-xs cursor-pointer shadow-xs active:scale-95" title="Sign Out of Portal">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
          <span class="hidden md:inline">Logout</span>
        </button>
      </div>
    `;
  } else if (PUBLIC_OPEN_ACCESS) {
    // Public open-access mode — no login / logout controls.
    container.innerHTML = `
      <span class="flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-400/30 font-semibold px-3 py-1.5 rounded-lg text-xs" title="Open access — no login required">
        <i data-lucide="unlock" class="w-4 h-4"></i>
        <span class="hidden sm:inline">Open Access</span>
      </span>
    `;
  } else {
    container.innerHTML = `
      <button onclick="showAuthScreen()" class="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3.5 py-1.5 rounded-lg shadow-sm transition text-xs">
        <i data-lucide="log-in" class="w-4 h-4"></i>
        <span>Sign In</span>
      </button>
    `;
  }

  // Role gate (Phase 1) — apply nav/tab gating whenever the header (and role) refreshes
  if (user && user.email) enforceRoleUI();

  if (window.lucide) lucide.createIcons();
}

function openProfileModalSafe() {
  if (currentUser && currentUser.email) {
    const roleKey = getUserRole(currentUser);
    const roleConfig = USER_ROLES[roleKey] || USER_ROLES.ADMIN;
    showToast(`Signed in as ${currentUser.email} (${roleConfig.label})`, 'info');
  } else {
    showAuthScreen();
  }
}

function handleSignIn(arg) {
  showAuthScreen();
}
window.handleSignIn = handleSignIn;

async function handleAuthSignIn(event) {
  event.preventDefault();
  clearAuthAlert();

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');

  const rawInput = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!rawInput || !password) {
    showAuthAlert('Please enter both your Login ID / Email and password.', 'error');
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    showAuthAlert('Supabase client connection not available. Please refresh the page.', 'error');
    return;
  }

  // Set loading state on button
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="inline-block animate-spin mr-2">⟳</span>
      <span>Authenticating...</span>
    `;
  }

  try {
    let targetEmail = rawInput;

    // If devotee provided a Login ID or username without '@', resolve to matching registered email
    if (!rawInput.includes('@')) {
      try {
        // Attempt 1: Call database RPC function if available
        const { data: rpcEmail, error: rpcErr } = await client.rpc('resolve_login_email', { p_login_id: rawInput });
        if (!rpcErr && rpcEmail && typeof rpcEmail === 'string' && rpcEmail.includes('@')) {
          targetEmail = rpcEmail.trim();
        }
      } catch (e) { /* ignore */ }

      // Attempt 2: Search user_profiles table by email prefix or full_name
      if (!targetEmail.includes('@')) {
        try {
          const { data: profile } = await client
            .from('user_profiles')
            .select('email')
            .ilike('email', `${rawInput}@%`)
            .limit(1)
            .maybeSingle();
          if (profile && profile.email) {
            targetEmail = profile.email;
          }
        } catch (e) { /* ignore */ }
      }

      // Attempt 3: Search profiles table
      if (!targetEmail.includes('@')) {
        try {
          const { data: p2 } = await client
            .from('profiles')
            .select('email')
            .ilike('email', `${rawInput}@%`)
            .limit(1)
            .maybeSingle();
          if (p2 && p2.email) {
            targetEmail = p2.email;
          }
        } catch (e) { /* ignore */ }
      }

      // Attempt 4: Fallback domain if entered username looks like an ID
      if (!targetEmail.includes('@')) {
        targetEmail = `${rawInput.toLowerCase()}@iskcon.org`;
      }
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: targetEmail,
      password: password
    });

    if (error) {
      let errMsg = formatAuthErrorMessage(error);
      if (!rawInput.includes('@')) {
        errMsg += ' (Tip: You can also sign in directly using your registered email address).';
      }
      showAuthAlert(errMsg, 'error');
      return;
    }

    if (data && data.user) {
      currentUser = data.user;
      // Profile must be loaded before the Admin/User door check
      await showPortalDashboard(currentUser);

      // Keep the URL in sync with the signed-in panel (deep-linkable Admin/User URLs)
      setPanelUrl(authDoor || getActivePanel());

      const name = getUserDisplayName(currentUser);
      if (typeof showToast === 'function') {
        showToast(`Hare Krishna, ${name}! Welcome back.`, 'success');
      }


      // Log sign-in activity in audit history
      logActivity('login', 'Authentication', `Devotee signed in: ${name} (${getUserRole(currentUser)})`);

      // Sync fresh live devotee data from Supabase
      await initSupabaseAndSync();
    }
  } catch (err) {
    console.error('Sign in exception:', err);
    showAuthAlert('Unable to complete sign in. Please check your network and try again.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <i data-lucide="log-in" class="w-4 h-4"></i>
        <span>Sign In to Portal</span>
      `;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function handleAuthSignOut() {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
  }

  unsubscribeFromDeleteRequests();
  currentUser = null;
  currentUserProfile = null;
  currentUserRole = 'VIEWER';
  state.activityLog = [];
  try { localStorage.removeItem(STORAGE_KEYS.ACTIVITY); } catch (e) {}

  // Securely clear table DOM content so unauthenticated visitors cannot view cached records
  const devBody = document.getElementById('devotees-table-body');
  if (devBody) devBody.innerHTML = '';
  const parcelBody = document.getElementById('parcels-table-body');
  if (parcelBody) parcelBody.innerHTML = '';
  const bdayGrid = document.getElementById('bday-grid-container');
  if (bdayGrid) bdayGrid.innerHTML = '';

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';

  showAuthScreen();

  if (typeof showToast === 'function') {
    showToast('You have been signed out successfully.', 'info');
  }
}

// ----------------------------------------------------
// FORGOT PASSWORD MODAL & WORKFLOW
// ----------------------------------------------------
function openForgotPasswordModal() {
  const modal = document.getElementById('forgot-password-modal');
  const alertEl = document.getElementById('forgot-alert');
  if (alertEl) alertEl.classList.add('hidden');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgot-password-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleForgotPasswordSubmit(event) {
  event.preventDefault();
  const emailInput = document.getElementById('forgot-email');
  const alertEl = document.getElementById('forgot-alert');
  const submitBtn = document.getElementById('forgot-submit-btn');

  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) return;

  const client = getSupabaseClient();
  if (!client) {
    if (alertEl) {
      alertEl.innerText = 'Supabase client is not available.';
      alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
      alertEl.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Sending Link...</span>`;
  }

  try {
    // Reset links require a real web origin — a file:// page can never be
    // opened back from the email, so warn instead of pretending it worked.
    if (!/^https?:$/.test(window.location.protocol)) {
      if (alertEl) {
        alertEl.innerText = 'Password reset links only work on the deployed site (https://…). Please open the portal from Vercel and try again.';
        alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
        alertEl.classList.remove('hidden');
      }
      return;
    }

    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      let text = error.message || 'Unable to send the reset email. Please try again later.';
      if (msg.includes('rate limit') || msg.includes('request this after')) {
        text = 'Too many reset requests — please wait a minute before requesting another link.';
      } else if (msg.includes('redirect') || msg.includes('url')) {
        text = 'Reset link setup problem: add this exact site URL to Supabase → Authentication → URL Configuration → Redirect URLs.';
      }
      if (alertEl) {
        alertEl.innerText = text;
        alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
        alertEl.classList.remove('hidden');
      }
      return;
    }

    if (alertEl) {
      // Security best practice: Do not disclose whether email exists
      alertEl.innerText = 'If this email is registered in our portal, a password reset link has been sent. Please check your inbox.';
      alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-emerald-950/60 border-emerald-800 text-emerald-200';
      alertEl.classList.remove('hidden');
    }
    if (emailInput) emailInput.value = '';
  } catch (err) {
    if (alertEl) {
      alertEl.innerText = 'Unable to send reset email. Please try again later.';
      alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
      alertEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Send Reset Link</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ----------------------------------------------------
// PASSWORD RECOVERY / UPDATE WORKFLOW
// ----------------------------------------------------
function openResetPasswordModal() {
  pendingPasswordRecovery = true;
  const forgot = document.getElementById('forgot-password-modal');
  if (forgot) forgot.classList.add('hidden');
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.remove('hidden');
  const alertEl = document.getElementById('reset-alert');
  if (alertEl) alertEl.classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeResetPasswordModal() {
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.add('hidden');
  const alertEl = document.getElementById('reset-alert');
  if (alertEl) alertEl.classList.add('hidden');

  // Closing the reset window with a live session should still let the visitor
  // into the portal (they can run Forgot Password again at any time).
  if (pendingPasswordRecovery) {
    pendingPasswordRecovery = false;
    clearAuthUrlMarkers();
    if (currentUser) {
      (async () => {
        try {
          await showPortalDashboard(currentUser);
          setPanelUrl(getActivePanel());
          await initSupabaseAndSync();
        } catch (e) { console.warn('Post-recovery portal entry:', e); }
      })();
    }
  }
}

async function handleUpdatePasswordSubmit(event) {
  event.preventDefault();
  const passwordInput = document.getElementById('reset-new-password');
  const alertEl = document.getElementById('reset-alert');
  const submitBtn = document.getElementById('reset-submit-btn');

  const newPassword = passwordInput ? passwordInput.value : '';
  if (!newPassword || newPassword.length < 6) {
    if (alertEl) {
      alertEl.innerText = 'Password must be at least 6 characters.';
      alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
      alertEl.classList.remove('hidden');
    }
    return;
  }

  const client = getSupabaseClient();
  if (!client) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Updating Password...</span>`;
  }

  try {
    const { data, error } = await client.auth.updateUser({
      password: newPassword
    });

    if (error) {
      if (alertEl) {
        alertEl.innerText = error.message || 'Unable to update password.';
        alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
        alertEl.classList.remove('hidden');
      }
      return;
    }

    pendingPasswordRecovery = false;
    closeResetPasswordModal();
    clearAuthUrlMarkers();
    currentUser = data.user;
    await showPortalDashboard(currentUser);
    setPanelUrl(getActivePanel());
    await initSupabaseAndSync();
    if (typeof showToast === 'function') {
      showToast('Password updated successfully! Welcome to the portal.', 'success');
    }
  } catch (err) {
    if (alertEl) {
      alertEl.innerText = 'Unexpected error updating password.';
      alertEl.className = 'mb-3 text-xs p-3 rounded-xl border bg-rose-950/60 border-rose-800 text-rose-200';
      alertEl.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Update Password & Enter</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ----------------------------------------------------
// AUTH STATE LISTENER & SESSION INITIALIZATION
// ----------------------------------------------------
function setupAuthListener() {
  const client = getSupabaseClient();
  if (!client) return;

  client.auth.onAuthStateChange(async (event, session) => {
    console.log('🔔 Supabase Auth event:', event);

    if (event === 'PASSWORD_RECOVERY') {
      pendingPasswordRecovery = true;
      openResetPasswordModal();
      clearAuthUrlMarkers();
      return;
    }

    if (pendingPasswordRecovery) {
      // Don't auto-enter the dashboard while the user is still choosing a new password
      if (event === 'SIGNED_IN' && session?.user) {
        currentUser = session.user;
        return;
      }
    }

    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      pendingPasswordRecovery = false;
      clearAuthUrlMarkers();
      await showPortalDashboard(currentUser);
      await initSupabaseAndSync();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentUserProfile = null;
      currentUserRole = 'VIEWER';
      pendingPasswordRecovery = false;
      clearAuthUrlMarkers();
      showAuthScreen();
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      currentUser = session.user;
      updateAuthHeader(currentUser);
    }
  });
}

async function initAuthSystem() {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('⚠️ Supabase client not loaded, displaying sign in screen.');
    showAuthScreen();
    return;
  }

  // 1. Setup real-time listener for auth events
  setupAuthListener();

  // 2. Check for password recovery / auth tokens in URL (recover quickly;
  //    Supabase may also emit PASSWORD_RECOVERY). For the common case with
  //    #access_token=...&type=recovery, open the reset modal before getSession()
  //    can interfere with the PKCE/recovery flow.
  const markers = findAuthUrlMarkers(INITIAL_AUTH_URL.hash, INITIAL_AUTH_URL.search);
  const hasRecovery = markers.isRecovery || /type=recovery/i.test(INITIAL_AUTH_URL.hash + INITIAL_AUTH_URL.search);
  if (hasRecovery || markers.errorCode) {
    if (markers.errorCode) {
      console.warn('🔑 Auth error in URL:', markers.errorCode, markers.errorDescription || '');
      const msg = markers.errorDescription || markers.errorCode || 'Authentication link is invalid or has expired.';
      showAuthScreen();
      showAuthAlert('⛔ ' + msg, 'error');
      clearAuthUrlMarkers();
      return;
    }
    console.log('🔑 Password recovery link detected in URL.');
    pendingPasswordRecovery = true;
    openResetPasswordModal();
    // Don't return here if a session is already present; let the listener
    // and getSession handle it. But we still want to show the reset form.
  }

  // 3. Inspect existing authenticated session
  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn('Session verification warning:', error.message);
      showAuthScreen();
      return;
    }

    if (data?.session?.user) {
      currentUser = data.session.user;
      console.log('✅ Active session confirmed for:', currentUser.email);

      // While a password-recovery link is open, keep the user on that flow.
      if (pendingPasswordRecovery) {
        return;
      }

      // Load the role FIRST so the URL route guard can decide before the portal opens
      try {
        await fetchUserProfile(currentUser);
        updateAuthHeader(currentUser);
      } catch (e) {
        console.warn('Profile fetch handled:', e);
      }

      const panelFromUrl = getPanelFromUrl();
      const decision = applyRouteGuard(panelFromUrl);
      if (decision === 'DENIED') {
        console.warn('⛔ Route guard denied', currentUser.email, '→', panelFromUrl, 'URL');
        showAuthScreen(); // keeps ?panel=... in the URL
        showAccessDenied(panelFromUrl, getActiveRoleKey());
        return;
      }
      if (decision === 'REDIRECT') {
        // Admin opened the User URL → send them to their own Admin URL
        setPanelUrl('ADMIN');
      }

      await showPortalDashboard(currentUser);
      await initSupabaseAndSync();
    } else {
      console.log('🔒 No active session. Locking portal with Sign In screen.');
      showAuthScreen();
    }
  } catch (err) {
    console.error('Session initialization error:', err);
    showAuthScreen();
  }
}

// ----------------------------------------------------
// TAB NAVIGATION
// ----------------------------------------------------
// ======================================================================
// 🧾 COMPLETE SECURE AUDIT LOGGING & AUDIT TRAIL ENGINE
// Automatically captures who / what / when / result / old vs new diffs.
// Server-backed with Supabase RLS and tamper-proof triggers.
// ======================================================================
const ACTIVITY_LOG_MAX = 500;

const ACTIVITY_ACTIONS = {
  create:         { label: 'Created',          icon: 'plus-circle',   color: 'emerald' },
  edit:           { label: 'Updated',          icon: 'pencil',        color: 'sky' },
  remove:         { label: 'Removed',          icon: 'archive',       color: 'amber' },
  restore:        { label: 'Restored',         icon: 'rotate-ccw',    color: 'emerald' },
  delete:         { label: 'Deleted',          icon: 'trash-2',       color: 'rose' },
  import:         { label: 'Imported',         icon: 'upload',        color: 'violet' },
  clear:          { label: 'Cleared',          icon: 'alert-octagon', color: 'rose' },
  sync:           { label: 'Synced',           icon: 'cloud',         color: 'sky' },
  parcel:         { label: 'Parcel Logistics', icon: 'truck',         color: 'indigo' },
  login:          { label: 'Devotee Login',    icon: 'log-in',        color: 'teal' },
  request_delete: { label: 'Delete Requested', icon: 'help-circle',   color: 'amber' },
  approve_delete: { label: 'Delete Approved',  icon: 'check-circle-2',color: 'emerald' },
  reject_delete:  { label: 'Delete Rejected',  icon: 'x-circle',      color: 'slate' },
  denied:         { label: 'Access Denied',    icon: 'shield-alert',  color: 'rose' }
};

// Deeply scrub passwords, tokens, API keys, and sensitive auth secrets
function sanitizeAuditPayload(data) {
  if (!data || typeof data !== 'object') return data;
  const sensitiveKeys = new Set([
    'password', 'pass', 'token', 'access_token', 'refresh_token',
    'secret', 'apiKey', 'api_key', 'service_role', 'auth', 'private_key'
  ]);
  if (Array.isArray(data)) {
    return data.map(item => sanitizeAuditPayload(item));
  }
  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    if (sensitiveKeys.has(k) || sensitiveKeys.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      clean[k] = sanitizeAuditPayload(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function persistActivityLog() {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(state.activityLog || []));
  } catch (e) { /* ignore quota */ }
}

// Record a comprehensive audit event (server-side RPC with safe fallback)
async function recordAuditEvent({
  action = 'edit',
  module = 'general',
  recordId = null,
  summary = '',
  result = 'SUCCESS',
  oldValues = null,
  newValues = null,
  details = null
} = {}) {
  const normAction = (action || 'edit').toLowerCase();
  const normModule = (module || 'general').toLowerCase();
  const normResult = ['SUCCESS', 'DENIED', 'FAILED'].includes((result || '').toUpperCase())
    ? result.toUpperCase()
    : 'SUCCESS';

  const uid = currentUser?.id || (currentUserProfile && currentUserProfile.id) || null;
  const actorName = (currentUserProfile && currentUserProfile.full_name) ||
                    (currentUser && currentUser.email ? currentUser.email.split('@')[0] : 'Sevak');
  const actorEmail = (currentUser && currentUser.email) || (currentUserProfile && currentUserProfile.email) || '';
  const actorRole = getActiveRoleKey();

  const cleanOld = sanitizeAuditPayload(oldValues);
  const cleanNew = sanitizeAuditPayload(newValues);
  const cleanDetails = sanitizeAuditPayload(details);

  const localEntry = {
    id: 'act_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    userId: uid,
    staffName: actorName,
    staffEmail: actorEmail,
    action: normAction,
    module: normModule,
    recordId: recordId ? String(recordId) : null,
    summary: summary || `${normAction.toUpperCase()} on ${normModule}`,
    result: normResult,
    oldValues: cleanOld,
    newValues: cleanNew,
    changeDetails: cleanDetails,
    actor: actorEmail ? `${actorName} (${actorEmail})` : actorName,
    actorRole: actorRole
  };

  // Immediate local state update for fast UX
  if (!Array.isArray(state.activityLog)) state.activityLog = [];
  state.activityLog.unshift(localEntry);
  if (state.activityLog.length > ACTIVITY_LOG_MAX) state.activityLog.length = ACTIVITY_LOG_MAX;
  persistActivityLog();

  if (typeof updateActivityNavBadge === 'function') updateActivityNavBadge();
  if (typeof renderRecentChanges === 'function') renderRecentChanges();
  if (typeof renderActivityLog === 'function') renderActivityLog();

  // Async server-side persistence
  const client = getSupabaseClient();
  if (client) {
    try {
      // 1. Try secure stored procedure record_audit_event (server resolves user and verifies role)
      const { data: rpcLogId, error: rpcErr } = await client.rpc('record_audit_event', {
        p_action: normAction,
        p_module: normModule,
        p_record_id: recordId ? String(recordId) : null,
        p_summary: summary || '',
        p_result: normResult,
        p_old_values: cleanOld,
        p_new_values: cleanNew,
        p_change_details: cleanDetails
      });

      if (!rpcErr && rpcLogId) {
        localEntry.id = String(rpcLogId);
        persistActivityLog();
        return;
      }

      // 2. Fallback to direct insert if RPC is not yet created
      const payload = {
        user_id: uid,
        staff_name: actorName,
        staff_email: actorEmail,
        action: normAction,
        module: normModule,
        record_id: recordId ? String(recordId) : null,
        summary: summary || '',
        result: normResult,
        old_values: cleanOld,
        new_values: cleanNew,
        change_details: cleanDetails,
        actor_role: actorRole
      };
      const { error: insErr } = await client.from('activity_log').insert(payload);
      if (insErr) {
        if (/does not exist|PGRST205/i.test(insErr.message || '')) {
          console.warn('☁️ activity_log table missing — run supabase-activity-audit-centralization.sql');
        }
      }
    } catch (e) {
      console.warn('recordAuditEvent server write failed:', e);
    }
  }
}

// Backward-compatible wrapper for existing call-sites
function logActivity(action, entity, summary, targetId) {
  try {
    recordAuditEvent({
      action: action || 'edit',
      module: (entity || 'general').toLowerCase(),
      recordId: targetId || null,
      summary: summary || '',
      result: 'SUCCESS'
    });
  } catch (e) { console.warn('logActivity failed:', e); }
}

async function loadActivityLogFromCloud(forceToast = false) {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const isSuper = isSuperAdmin();
    const myId = currentUser?.id;
    const myEmail = (currentUser?.email || '').toLowerCase();

    // Supabase RLS enforces that:
    // - Super Admin sees all rows across all staff
    // - Staff members see only rows where user_id = auth.uid()
    let query = client
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    // Defense-in-depth: if not super admin, strictly filter by current user's id
    if (!isSuper && myId) {
      query = query.eq('user_id', myId);
    }

    const { data, error } = await query;

    if (error) {
      if (/does not exist|relation .* does not exist|PGRST205/i.test(error.message || '')) {
        console.warn('☁️ activity_log table missing — run supabase-isolate-user-activity-log.sql');
      }
      return;
    }

    if (Array.isArray(data)) {
      const merged = new Map();

      // If not super admin, filter out any cached entries belonging to other users
      (state.activityLog || []).forEach(e => {
        if (!isSuper) {
          const match = (myId && e.userId === myId) ||
                        (myEmail && (e.staffEmail || '').toLowerCase() === myEmail);
          if (!match) return; // strip cached foreign entries
        }
        merged.set(e.id, e);
      });

      data.forEach(r => {
        // Double-check row ownership for non-super-admin
        if (!isSuper && myId && r.user_id && r.user_id !== myId) {
          return; // strictly ignore foreign rows
        }
        merged.set(String(r.id), {
          id: String(r.id),
          ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          userId: r.user_id || null,
          staffName: r.staff_name || '',
          staffEmail: r.staff_email || '',
          action: r.action || 'edit',
          module: r.module || r.entity || 'general',
          recordId: r.record_id || r.target_id || null,
          summary: r.summary || '',
          result: r.result || 'SUCCESS',
          oldValues: r.old_values || null,
          newValues: r.new_values || null,
          changeDetails: r.change_details || null,
          actor: r.staff_name ? (r.staff_email ? `${r.staff_name} (${r.staff_email})` : r.staff_name) : (r.actor || 'Sevak'),
          actorRole: r.actor_role || ''
        });
      });

      const arr = Array.from(merged.values())
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, ACTIVITY_LOG_MAX);

      state.activityLog = arr;
      persistActivityLog();

      if (typeof populateActivityStaffFilter === 'function') populateActivityStaffFilter();
      if (typeof updateActivityNavBadge === 'function') updateActivityNavBadge();
      if (typeof renderRecentChanges === 'function') renderRecentChanges();
      if (typeof renderActivityLog === 'function') renderActivityLog();

      if (forceToast) {
        showToast(isSuper
          ? `Audit log refreshed (${arr.length} entries loaded).`
          : `Personal activity log refreshed (${arr.length} entries loaded).`,
          'success'
        );
      }
    }
  } catch (e) {
    console.warn('loadActivityLogFromCloud error:', e);
  }
}

// Populate the Staff member dropdown filter dynamically
function populateActivityStaffFilter() {
  const sel = document.getElementById('activity-staff-filter');
  const wrap = document.getElementById('activity-staff-filter-wrap');
  if (!sel) return;

  const isSuper = isSuperAdmin();

  // If not super admin, staff member can only see their own logs
  if (!isSuper) {
    if (wrap) wrap.classList.add('opacity-60', 'pointer-events-none');
    sel.innerHTML = `<option value="SELF">👤 My Activity (${escapeHtml(currentUserProfile?.full_name || currentUser?.email || 'You')})</option>`;
    return;
  }

  if (wrap) wrap.classList.remove('opacity-60', 'pointer-events-none');

  const curVal = sel.value || 'ALL';
  const staffMap = new Map();

  // 1. From state.staffList
  if (Array.isArray(state.staffList)) {
    state.staffList.forEach(s => {
      const key = s.id || s.email;
      if (key) {
        staffMap.set(key, {
          id: s.id,
          name: s.fullName || s.email,
          email: s.email,
          role: s.role || 'STAFF'
        });
      }
    });
  }

  // 2. From distinct activity logs
  (state.activityLog || []).forEach(e => {
    if (e.userId && !staffMap.has(e.userId)) {
      staffMap.set(e.userId, {
        id: e.userId,
        name: e.staffName || e.staffEmail || 'Sevak',
        email: e.staffEmail,
        role: e.actorRole || 'STAFF'
      });
    } else if (e.staffEmail && !staffMap.has(e.staffEmail)) {
      staffMap.set(e.staffEmail, {
        id: e.userId || e.staffEmail,
        name: e.staffName || e.staffEmail,
        email: e.staffEmail,
        role: e.actorRole || 'STAFF'
      });
    }
  });

  let optionsHtml = '<option value="ALL">👤 All Staff Accounts</option>';
  staffMap.forEach(s => {
    const roleTag = s.role ? ` · [${s.role}]` : '';
    optionsHtml += `<option value="${escapeHtml(s.id || s.email)}">${escapeHtml(s.name)}${roleTag}</option>`;
  });

  sel.innerHTML = optionsHtml;
  if (Array.from(sel.options).some(o => o.value === curVal)) {
    sel.value = curVal;
  }
}

function formatActivityWhen(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function updateActivityNavBadge() {
  const badge = document.getElementById('nav-activity-badge');
  if (badge) {
    const list = getFilteredActivityLog();
    badge.innerText = list.length;
  }
}

function getFilteredActivityLog() {
  const isSuper = isSuperAdmin();
  const staffFilter = (document.getElementById('activity-staff-filter') || {}).value || 'ALL';
  const moduleFilter = (document.getElementById('activity-module-filter') || {}).value || 'ALL';
  const actionFilter = (document.getElementById('activity-filter') || {}).value || 'ALL';
  const dateFilter = (document.getElementById('activity-date-filter') || {}).value || 'ALL';
  const q = ((document.getElementById('activity-search') || {}).value || '').trim().toLowerCase();

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayTs = startOfToday.getTime();

  const startOfYesterday = new Date(startOfTodayTs - 24 * 60 * 60 * 1000);
  const startOfYesterdayTs = startOfYesterday.getTime();

  return (state.activityLog || []).filter(e => {
    // 1. Staff isolation: non-super-admins strictly see only their own actions
    if (!isSuper) {
      const myId = currentUser?.id;
      const myEmail = (currentUser?.email || '').toLowerCase();
      const match = (myId && e.userId === myId) ||
                    (myEmail && (e.staffEmail || '').toLowerCase() === myEmail);
      if (!match) return false;
    } else if (staffFilter !== 'ALL') {
      const matchStaff = (e.userId && e.userId === staffFilter) ||
                         (e.staffEmail && e.staffEmail.toLowerCase() === staffFilter.toLowerCase()) ||
                         (e.id === staffFilter);
      if (!matchStaff) return false;
    }

    // 2. Module Filter
    if (moduleFilter !== 'ALL') {
      const m = (e.module || '').toLowerCase();
      if (!m.includes(moduleFilter.toLowerCase())) return false;
    }

    // 3. Action Filter
    if (actionFilter !== 'ALL') {
      const a = (e.action || '').toLowerCase();
      if (actionFilter === 'parcel') {
        const isParcel = (e.module || '').includes('parcel') || a === 'parcel';
        if (!isParcel) return false;
      } else if (a !== actionFilter.toLowerCase()) {
        return false;
      }
    }

    // 4. Date Range Filter
    const eTs = e.ts || 0;
    if (dateFilter === 'today') {
      if (eTs < startOfTodayTs) return false;
    } else if (dateFilter === 'yesterday') {
      if (eTs < startOfYesterdayTs || eTs >= startOfTodayTs) return false;
    } else if (dateFilter === '7days') {
      if (eTs < now - 7 * 24 * 60 * 60 * 1000) return false;
    } else if (dateFilter === '30days') {
      if (eTs < now - 30 * 24 * 60 * 60 * 1000) return false;
    }

    // 5. Text Search Query
    if (q) {
      const searchTarget = `
        ${e.summary || ''} 
        ${e.staffName || ''} 
        ${e.staffEmail || ''} 
        ${e.actor || ''} 
        ${e.userId || ''} 
        ${e.recordId || ''} 
        ${e.module || ''} 
        ${e.action || ''} 
        ${e.result || ''}
      `.toLowerCase();
      if (!searchTarget.includes(q)) return false;
    }

    return true;
  });
}

function activityItemHtml(entry) {
  const meta = ACTIVITY_ACTIONS[entry.action] || { label: entry.action || 'Activity', icon: 'activity', color: 'slate' };
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    sky: 'bg-sky-50 text-sky-700 border-sky-200/80',
    amber: 'bg-amber-50 text-amber-700 border-amber-200/80',
    rose: 'bg-rose-50 text-rose-700 border-rose-200/80',
    violet: 'bg-violet-50 text-violet-700 border-violet-200/80',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    teal: 'bg-teal-50 text-teal-700 border-teal-200/80',
    slate: 'bg-slate-50 text-slate-700 border-slate-200/80'
  };
  const badgeClass = colorMap[meta.color] || colorMap.slate;

  // Result Badge
  let resultBadge = '';
  if (entry.result === 'DENIED') {
    resultBadge = '<span class="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 uppercase">⛔ Denied</span>';
  } else if (entry.result === 'FAILED') {
    resultBadge = '<span class="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase">⚠️ Failed</span>';
  } else {
    resultBadge = '<span class="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">✓ Success</span>';
  }

  // Has change diff data
  const hasDiff = !!(entry.oldValues || entry.newValues || entry.changeDetails);
  const diffBtn = hasDiff
    ? `<button type="button" onclick="openActivityDiffModal('${escapeHtml(entry.id)}')" class="py-1 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-semibold text-[10.5px] rounded-lg transition flex items-center space-x-1 cursor-pointer shadow-xs active:scale-95 shrink-0">
         <i data-lucide="diff" class="w-3 h-3"></i>
         <span>Inspect Diff</span>
       </button>`
    : '';

  // Formatted User ID (UUID)
  const shortUid = entry.userId ? `${entry.userId.slice(0, 8)}…` : 'Guest';

  return `
    <div class="flex items-start space-x-3.5 p-3.5 hover:bg-slate-50/70 transition-colors border-b border-slate-100 last:border-0 rounded-xl">
      <div class="w-9 h-9 rounded-xl ${badgeClass} border flex items-center justify-center shrink-0 shadow-xs mt-0.5">
        <i data-lucide="${meta.icon}" class="w-4 h-4"></i>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center justify-between gap-1 mb-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-bold text-slate-800">${escapeHtml(meta.label)}</span>
            ${entry.module ? `<span class="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md uppercase">${escapeHtml(entry.module)}</span>` : ''}
            ${resultBadge}
            ${entry.recordId ? `<span class="text-[10px] font-mono text-indigo-600 bg-indigo-50/70 border border-indigo-200/50 px-1.5 py-0.5 rounded font-semibold" title="Record ID: ${escapeHtml(entry.recordId)}">#${escapeHtml(entry.recordId.slice(0, 14))}</span>` : ''}
          </div>
          <div class="flex items-center space-x-2">
            ${diffBtn}
            <span class="text-[11px] font-medium text-slate-400 shrink-0 flex items-center space-x-1" title="${new Date(entry.ts).toLocaleString()}">
              <i data-lucide="clock" class="w-3 h-3"></i>
              <span>${formatActivityWhen(entry.ts)}</span>
            </span>
          </div>
        </div>
        <p class="text-xs text-slate-700 leading-relaxed font-normal">${escapeHtml(entry.summary || '')}</p>
        <div class="text-[11px] text-slate-400 mt-1.5 flex flex-wrap items-center gap-2">
          <span class="flex items-center space-x-1 text-slate-600 font-medium">
            <i data-lucide="user" class="w-3 h-3 text-slate-400"></i>
            <span>${escapeHtml(entry.staffName || entry.actor || 'Sevak')}</span>
            ${entry.staffEmail ? `<span class="text-slate-400 text-[10px]">(${escapeHtml(entry.staffEmail)})</span>` : ''}
          </span>
          ${entry.actorRole ? `<span class="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">${escapeHtml(entry.actorRole)}</span>` : ''}
          ${entry.userId ? `<span class="text-[9.5px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200/60" title="Auth User ID: ${escapeHtml(entry.userId)}">UID: ${escapeHtml(shortUid)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function renderActivityLog() {
  updateActivityNavBadge();
  const host = document.getElementById('activity-log-list');
  if (!host) return;

  const isSuper = isSuperAdmin();

  // Dynamic Header Title & Subtitle based on Role
  const titleEl = document.getElementById('activity-view-title');
  const subEl = document.getElementById('activity-view-subtitle');
  const clearBtn = document.getElementById('btn-clear-activity-log');

  if (titleEl) {
    titleEl.innerHTML = isSuper
      ? `<span>All Portal Activity Log</span><span class="text-amber-400 text-lg">🪷</span>`
      : `<span>My Activity History</span><span class="text-amber-400 text-lg">🪷</span>`;
  }
  if (subEl) {
    subEl.innerText = isSuper
      ? `Centralized real-time audit history tracking all devotee additions, edits, removals, parcels, calls, deletion requests, and devotee logins across all sevak accounts.`
      : `Your personal seva operation history. Only your authenticated actions are displayed here, secured by Supabase Row Level Security.`;
  }
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !isSuper);
  }

  // Populate Staff dropdown if needed
  populateActivityStaffFilter();

  const countEl = document.getElementById('activity-count');
  const totalKpi = document.getElementById('activity-kpi-total');
  const todayKpi = document.getElementById('activity-kpi-today');
  const updatesKpi = document.getElementById('activity-kpi-updates');
  const parcelsKpi = document.getElementById('activity-kpi-parcels');

  // Filter list
  const list = getFilteredActivityLog();
  if (countEl) countEl.innerText = list.length;
  if (totalKpi) totalKpi.innerText = list.length;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayTs = startOfToday.getTime();
  const todayCount = list.filter(e => (e.ts || 0) >= todayTs).length;
  if (todayKpi) todayKpi.innerText = todayCount;

  const updatesCount = list.filter(e => e.action === 'create' || e.action === 'edit').length;
  if (updatesKpi) updatesKpi.innerText = updatesCount;

  const parcelsCount = list.filter(e => (e.module || '').toLowerCase().includes('parcel') || e.action === 'parcel').length;
  if (parcelsKpi) parcelsKpi.innerText = parcelsCount;

  host.innerHTML = list.length
    ? list.slice(0, 300).map(activityItemHtml).join('')
    : `<div class="text-xs text-slate-400 py-12 text-center flex flex-col items-center justify-center space-y-2">
         <span class="text-3xl">📜</span>
         <span class="font-semibold text-slate-600">No matching activity records found</span>
         <span class="text-[11px] text-slate-400">Adjust the filters or search term above to view other events.</span>
       </div>`;

  if (window.lucide) lucide.createIcons();
}

function resetActivityFilters() {
  const staffSel = document.getElementById('activity-staff-filter');
  const modSel = document.getElementById('activity-module-filter');
  const actSel = document.getElementById('activity-filter');
  const dateSel = document.getElementById('activity-date-filter');
  const searchInp = document.getElementById('activity-search');

  if (staffSel && isSuperAdmin()) staffSel.value = 'ALL';
  if (modSel) modSel.value = 'ALL';
  if (actSel) actSel.value = 'ALL';
  if (dateSel) dateSel.value = 'ALL';
  if (searchInp) searchInp.value = '';

  renderActivityLog();
  showToast('Filters reset to default.', 'info');
}

// ----------------------------------------------------
// 🔍 AUDIT DIFF & DETAILS INSPECTOR MODAL
// ----------------------------------------------------
function openActivityDiffModal(entryId) {
  const entry = (state.activityLog || []).find(e => String(e.id) === String(entryId));
  if (!entry) {
    showToast('Activity record not found.', 'warning');
    return;
  }

  const modal = document.getElementById('activity-diff-modal');
  if (!modal) return;

  // Header and Metadata
  document.getElementById('diff-meta-actor').innerText = entry.staffName || entry.actor || 'Sevak';
  document.getElementById('diff-meta-role').innerText = entry.actorRole || 'STAFF';
  document.getElementById('diff-meta-module').innerText = (entry.module || 'general').toUpperCase();
  document.getElementById('diff-meta-action').innerText = (entry.action || 'edit').toUpperCase();
  document.getElementById('diff-meta-record-id').innerText = entry.recordId || 'N/A';
  document.getElementById('diff-meta-time').innerText = new Date(entry.ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  document.getElementById('diff-meta-user-id').innerText = entry.userId || 'Not authenticated / Local';
  document.getElementById('diff-meta-summary').innerText = entry.summary || 'No summary provided.';

  // Result Badge
  const badgeHost = document.getElementById('diff-modal-result-badge');
  if (badgeHost) {
    if (entry.result === 'DENIED') {
      badgeHost.innerHTML = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">DENIED</span>';
    } else if (entry.result === 'FAILED') {
      badgeHost.innerHTML = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">FAILED</span>';
    } else {
      badgeHost.innerHTML = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">SUCCESS</span>';
    }
  }

  // Diff Comparison Container
  const container = document.getElementById('diff-comparison-container');
  const oldVals = entry.oldValues;
  const newVals = entry.newValues;

  let diffHtml = '';

  if (oldVals && newVals && typeof oldVals === 'object' && typeof newVals === 'object') {
    // Both Old and New exist -> Calculate changed attributes
    const allKeys = Array.from(new Set([...Object.keys(oldVals), ...Object.keys(newVals)]));
    const changedKeys = allKeys.filter(k => {
      const v1 = JSON.stringify(oldVals[k]);
      const v2 = JSON.stringify(newVals[k]);
      return v1 !== v2;
    });

    if (changedKeys.length > 0) {
      diffHtml = `
        <div class="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div class="bg-slate-100/80 px-3.5 py-2 border-b border-slate-200 font-bold text-slate-700 flex items-center justify-between">
            <span>Changed Fields (${changedKeys.length})</span>
            <span class="text-[10px] text-slate-500 font-normal">Side-by-side comparison</span>
          </div>
          <div class="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
            ${changedKeys.map(k => {
              const oStr = oldVals[k] !== undefined ? (typeof oldVals[k] === 'object' ? JSON.stringify(oldVals[k]) : String(oldVals[k])) : '<empty>';
              const nStr = newVals[k] !== undefined ? (typeof newVals[k] === 'object' ? JSON.stringify(newVals[k]) : String(newVals[k])) : '<removed>';
              return `
                <div class="p-3 bg-white hover:bg-slate-50/50">
                  <div class="font-mono text-[11px] font-bold text-slate-700 mb-1.5">${escapeHtml(k)}</div>
                  <div class="grid grid-cols-2 gap-2 text-[11px]">
                    <div class="bg-rose-50/70 border border-rose-200/80 rounded-lg p-2 text-rose-900 font-mono break-all">
                      <div class="text-[9px] font-bold uppercase text-rose-500 mb-0.5">Previous Value</div>
                      ${escapeHtml(oStr)}
                    </div>
                    <div class="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-2 text-emerald-900 font-mono break-all">
                      <div class="text-[9px] font-bold uppercase text-emerald-600 mb-0.5">New Value</div>
                      ${escapeHtml(nStr)}
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    } else {
      diffHtml = `<div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-center">No field-level value changes detected in payload.</div>`;
    }
  } else if (newVals && typeof newVals === 'object') {
    // Only New Values exist (e.g. Creation)
    diffHtml = `
      <div class="border border-emerald-200 rounded-xl overflow-hidden shadow-xs">
        <div class="bg-emerald-50/80 px-3.5 py-2 border-b border-emerald-200 font-bold text-emerald-800">
          <span>Created Record Attributes</span>
        </div>
        <pre class="p-3.5 bg-white text-[11px] font-mono text-slate-700 max-h-[280px] overflow-y-auto whitespace-pre-wrap">${escapeHtml(JSON.stringify(newVals, null, 2))}</pre>
      </div>`;
  } else if (oldVals && typeof oldVals === 'object') {
    // Only Old Values exist (e.g. Deletion snapshot)
    diffHtml = `
      <div class="border border-rose-200 rounded-xl overflow-hidden shadow-xs">
        <div class="bg-rose-50/80 px-3.5 py-2 border-b border-rose-200 font-bold text-rose-800">
          <span>Archived / Deleted Record Snapshot</span>
        </div>
        <pre class="p-3.5 bg-white text-[11px] font-mono text-slate-700 max-h-[280px] overflow-y-auto whitespace-pre-wrap">${escapeHtml(JSON.stringify(oldVals, null, 2))}</pre>
      </div>`;
  } else if (entry.changeDetails) {
    diffHtml = `
      <div class="border border-indigo-200 rounded-xl overflow-hidden shadow-xs">
        <div class="bg-indigo-50/80 px-3.5 py-2 border-b border-indigo-200 font-bold text-indigo-800">
          <span>Change Details</span>
        </div>
        <pre class="p-3.5 bg-white text-[11px] font-mono text-slate-700 max-h-[280px] overflow-y-auto whitespace-pre-wrap">${escapeHtml(JSON.stringify(entry.changeDetails, null, 2))}</pre>
      </div>`;
  } else {
    diffHtml = `<div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-center">No snapshot or diff data attached to this audit record.</div>`;
  }

  container.innerHTML = diffHtml;
  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeActivityDiffModal() {
  const modal = document.getElementById('activity-diff-modal');
  if (modal) modal.classList.add('hidden');
}

window.openActivityDiffModal = openActivityDiffModal;
window.closeActivityDiffModal = closeActivityDiffModal;
window.resetActivityFilters = resetActivityFilters;
window.recordAuditEvent = recordAuditEvent;

function renderRecentChanges() {
  const host = document.getElementById('recent-changes-list');
  if (!host) return;
  const isSuper = isSuperAdmin();
  let list = state.activityLog || [];
  if (!isSuper) {
    const myId = currentUser?.id;
    const myEmail = (currentUser?.email || '').toLowerCase();
    list = list.filter(e => (myId && e.userId === myId) || (myEmail && (e.staffEmail || '').toLowerCase() === myEmail));
  }
  const topList = list.slice(0, 6);
  host.innerHTML = topList.length
    ? topList.map(activityItemHtml).join('')
    : `<div class="text-xs text-slate-400 py-5 text-center">No recent changes yet.</div>`;
  if (window.lucide) lucide.createIcons();
}

async function clearActivityLog() {
  if (!isSuperAdmin()) {
    showToast('⛔ Permission Denied: Only Super Admin can clear the audit history.', 'error');
    return;
  }
  const confirmed = await showAppConfirm({
    title: 'Purge Activity Audit Log?',
    message: 'This will purge the audit trail history. Devotee records and parcel logistics are not affected.',
    confirmText: 'Purge Log',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🧾'
  });
  if (!confirmed) return;

  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e) {}
  }

  state.activityLog = [];
  persistActivityLog();
  renderActivityLog();
  renderRecentChanges();
  updateActivityNavBadge();
  showToast('Activity audit log cleared.', 'info');
}

function exportActivityLogCsv() {
  const list = getFilteredActivityLog();
  if (!list.length) { showToast('No activity records to export.', 'info'); return; }
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['When', 'Actor Name', 'Email', 'User UUID', 'Role', 'Module', 'Action', 'Record ID', 'Result', 'Summary'].map(esc).join(',')];
  list.forEach(e => rows.push([
    new Date(e.ts).toLocaleString('en-GB'),
    e.staffName || e.actor,
    e.staffEmail || '',
    e.userId || '',
    e.actorRole || '',
    e.module || '',
    e.action || '',
    e.recordId || '',
    e.result || 'SUCCESS',
    e.summary || ''
  ].map(esc).join(',')));
  const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ISKCON_Activity_Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Activity log exported as CSV.', 'success');
}

function switchTab(tabId) {
  if (!currentUser) {
    showAuthScreen();
    return;
  }

  // Role gate (Phase 1) — a role may only open tabs belonging to its panel
  if (!allowedTabsForRole().includes(tabId)) {
    const roleKey = getActiveRoleKey();
    const roleLabel = (USER_ROLES[roleKey] || USER_ROLES.ADMIN).label;
    if (roleKey === 'STAFF') {
      showToast(`⛔ Access Restricted: You are not assigned to the "${tabId}" module. Please contact Super Admin.`, 'error');
    } else {
      showToast(`⛔ ${roleLabel} cannot open the "${tabId}" tab`, 'error');
    }
    return;
  }

  state.currentTab = tabId;

  // Toggle active view sections (Anniversaries tab reuses the wish-dashboard view)
  const views = ['dashboard', 'birthdays', 'parcels', 'devotees', 'removed', 'requests', 'roles', 'activity'];
  const effectiveTab = (tabId === 'anniversaries') ? 'birthdays' : tabId;
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === effectiveTab) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  // Deletion Requests tab — fetch and render pending requests
  if (tabId === 'requests') {
    fetchDeleteRequests();
  }

  // Staff & Roles tab — load and render staff list & permissions
  if (tabId === 'roles') {
    loadStaffListFromCloud();
  }

  // Activity Log tab — load from cloud and render full activity list & metrics
  if (tabId === 'activity') {
    loadActivityLogFromCloud();
    renderActivityLog();
  }

  // Dynamic heading for split Birthday / Anniversary tabs
  const bdayTitleEl = document.getElementById('bday-dash-title');
  if (bdayTitleEl) {
    bdayTitleEl.innerText = (tabId === 'anniversaries') ? 'Devotee Anniversary Wish Dashboard' : 'Devotee Birthday Wish Dashboard';
  }

  // Dynamic Date column header (per-tab, unless a specific Date View is active)
  updateCelebrationDateColumnHeader();

  // Show/hide tab-specific metric cards (Birthday tab hides Anniversary card, and vice-versa)
  const birthdayCard = document.getElementById('bday-card-birthdays');
  const annivCard = document.getElementById('bday-card-anniv');
  if (birthdayCard) birthdayCard.classList.toggle('hidden', tabId === 'anniversaries');
  if (annivCard) annivCard.classList.toggle('hidden', tabId === 'birthdays');

  // Removal Records tab — render BOTH Birthday & Anniversary removal lists separately
  if (tabId === 'removed') renderRemovedCelebrationSection();

  // Devotional nav bar: the active tab is styled purely by CSS (.nav-tab.active);
  // role visibility is handled separately by enforceRoleUI().
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // On phones the executive menu scrolls sideways — keep the active tab in view.
  const activeNavBtn = document.querySelector('#main-nav-tabs .nav-tab.active');
  if (activeNavBtn && typeof activeNavBtn.scrollIntoView === 'function') {
    try { activeNavBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
    catch (e) { /* older engines */ }
  }

  // Re-trigger specific tab renders
  if (tabId === 'dashboard') {
    updateKPIs();
    renderDashboard();
    initCharts();
    renderRecentChanges();
  } else if (tabId === 'devotees') {
    renderDevoteesTable();
  } else if (tabId === 'birthdays') {
    setCelebrationEventType('BIRTHDAY');
  } else if (tabId === 'anniversaries') {
    setCelebrationEventType('MARRIAGE');
  } else if (tabId === 'parcels') {
    renderParcelsTable();
  } else if (tabId === 'removed') {
    renderRemovedCelebrationSection();
  } else if (tabId === 'activity') {
    renderActivityLog();
  }

  // Re-label freshly rendered tables for the phone card layout
  applyMobileTableLabels();

  if (window.lucide) {
    lucide.createIcons();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------
// COUPLE MATCHING & MERGING ENGINE (ANNIVERSARY DEDUPLICATION)
// ----------------------------------------------------

/**
 * Normalizes names by converting to lowercase, removing punctuation, 
 * stripping honorifics and Vaishnava suffixes, and collapsing extra whitespace.
 * Works seamlessly with English, Bengali, Hindi, and transliterated scripts.
 */
function normalizeNameForMatching(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"’]/g, ' ')
    .replace(/\b(late|smt|srimati|shrimati|sri|shri|mr|mrs|ms|dr|das|dasi|devi|debi|dd|mataji|prabhu)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two names match according to the normalization rules.
 * Handles exact match, substring inclusion, and word-token overlap.
 */
function isNameMatch(name1, name2) {
  const norm1 = normalizeNameForMatching(name1);
  const norm2 = normalizeNameForMatching(name2);
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  // Substring match if string has at least 3 characters
  if ((norm1.length >= 3 && norm2.includes(norm1)) || (norm2.length >= 3 && norm1.includes(norm2))) {
    return true;
  }

  // Word token matching
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  if (words1.length > 0 && words2.length > 0) {
    const [shorter, longer] = words1.length <= words2.length ? [words1, words2] : [words2, words1];
    const allFound = shorter.every(sw => longer.some(lw => lw === sw || lw.includes(sw) || sw.includes(lw)));
    if (allFound) return true;
  }

  return false;
}

/**
 * Checks if two devotees have the same Anniversary Date (month & day).
 */
function doAnniversaryDatesMatch(d1, d2) {
  const a1 = d1.anniversaryDate || d1.anniversaryRaw || d1.anniversary;
  const a2 = d2.anniversaryDate || d2.anniversaryRaw || d2.anniversary;
  if (!a1 || !a2) return false;
  if (a1 === a2) return true;

  const p1 = parseDateParts(a1);
  const p2 = parseDateParts(a2);
  if (p1 && p2) {
    return p1.month === p2.month && p1.day === p2.day;
  }
  return false;
}

/**
 * Evaluates the 3-condition rule:
 * 1. Husband's spouse name matches Wife's name (legal or spiritual)
 * 2. Wife's spouse name matches Husband's name (legal or spiritual)
 * 3. Both have the same Anniversary Date
 */
function areDevoteesSameCouple(d1, d2) {
  if (!d1 || !d2 || d1.id === d2.id) return false;

  // Condition 3: Anniversary Date must match
  if (!doAnniversaryDatesMatch(d1, d2)) return false;

  const d1Spouse = d1.spouseName;
  const d2Spouse = d2.spouseName;
  if (!d1Spouse && !d2Spouse) return false;

  const d1Names = [d1.legalName, d1.spiritualName].filter(Boolean);
  const d2Names = [d2.legalName, d2.spiritualName].filter(Boolean);

  const d1SpouseMatchesD2 = d1Spouse && d2Names.some(n => isNameMatch(d1Spouse, n));
  const d2SpouseMatchesD1 = d2Spouse && d1Names.some(n => isNameMatch(d2Spouse, n));

  // Condition 1 & 2 mutual match
  if (d1SpouseMatchesD2 && d2SpouseMatchesD1) return true;

  // Or one spouse name matches and the other left spouse field blank / matching date
  if ((d1SpouseMatchesD2 && !d2Spouse) || (d2SpouseMatchesD1 && !d1Spouse)) {
    return true;
  }

  return false;
}

/**
 * Finds a devotee's matched spouse from the list of devotees.
 */
function findMatchedSpouseDevotee(devotee, devoteesList = state.devotees) {
  if (!devotee || (!devotee.anniversaryDate && !devotee.anniversaryRaw && !devotee.anniversary)) return null;
  for (const other of devoteesList) {
    if (other.id !== devotee.id && areDevoteesSameCouple(devotee, other)) {
      return other;
    }
  }
  return null;
}

/**
 * Merges couple anniversary records into 1 unified entry per couple.
 * Devotees without a registered spouse devotee remain 1 entry.
 */
function getMergedAnniversaryCelebrations(devoteesList = state.devotees) {
  const merged = [];
  const processedIds = new Set();

  for (let i = 0; i < devoteesList.length; i++) {
    const d1 = devoteesList[i];
    if (processedIds.has(d1.id)) continue;

    const annivStr = d1.anniversaryRaw || d1.anniversary || d1.anniversaryDate;
    if (!annivStr || annivStr === 'None' || annivStr === 'N/A') continue;

    // Search for matching spouse devotee
    let matchedPartner = null;
    for (let j = i + 1; j < devoteesList.length; j++) {
      const d2 = devoteesList[j];
      if (processedIds.has(d2.id)) continue;
      if (areDevoteesSameCouple(d1, d2)) {
        matchedPartner = d2;
        break;
      }
    }

    if (matchedPartner) {
      processedIds.add(d1.id);
      processedIds.add(matchedPartner.id);

      // Order Husband (Male) & Wife (Female) if gender is known
      let husband = d1;
      let wife = matchedPartner;
      if (d1.gender === 'Female' && matchedPartner.gender === 'Male') {
        husband = matchedPartner;
        wife = d1;
      }

      const activeDateStr = husband.anniversaryDate || wife.anniversaryDate || annivStr;
      const timing = checkEventTiming(activeDateStr);
      let aMo = husband.annivMonth || husband.aMonth || wife.annivMonth || wife.aMonth;
      let aDy = husband.annivDay || husband.aDay || wife.annivDay || wife.aDay;
      if (!aMo && timing.parts) { aMo = timing.parts.month + 1; aDy = timing.parts.day; }
      const years = calculateYearsPassed(activeDateStr) + (timing.isToday ? 0 : 1);

      const hName = husband.spiritualName || husband.legalName;
      const wName = wife.spiritualName || wife.legalName;

      merged.push({
        id: `couple_${husband.id}_${wife.id}`,
        devotee: husband,
        spouseDevotee: wife,
        isCouple: true,
        coupleIds: [husband.id, wife.id],
        coupleTitle: `${hName} & ${wName}`,
        eventType: 'MARRIAGE',
        label: 'Couple Anniversary',
        icon: 'heart',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        accentColor: 'border-emerald-300',
        date: activeDateStr,
        rawDateStr: husband.anniversaryRaw || wife.anniversaryRaw || husband.anniversary || formatDate(activeDateStr),
        month: aMo || (timing.parts ? timing.parts.month + 1 : 1),
        day: aDy || (timing.parts ? timing.parts.day : 1),
        years: years,
        milestone: years > 0 ? `${years} Years of Vivaha Harmony` : 'Marriage Anniversary',
        spouse: wName,
        timing: timing
      });
    } else {
      processedIds.add(d1.id);
      const timing = checkEventTiming(d1.anniversaryDate || annivStr);
      let aMo = d1.annivMonth || d1.aMonth;
      let aDy = d1.annivDay || d1.aDay;
      if (!aMo && timing.parts) { aMo = timing.parts.month + 1; aDy = timing.parts.day; }
      const years = calculateYearsPassed(d1.anniversaryDate || annivStr) + (timing.isToday ? 0 : 1);

      merged.push({
        id: d1.id,
        devotee: d1,
        spouseDevotee: null,
        isCouple: false,
        coupleIds: [d1.id],
        coupleTitle: d1.spiritualName || d1.legalName,
        eventType: 'MARRIAGE',
        label: 'Marriage Anniversary',
        icon: 'heart',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        accentColor: 'border-emerald-300',
        date: d1.anniversaryDate || annivStr,
        rawDateStr: d1.anniversaryRaw || d1.anniversary || formatDate(d1.anniversaryDate),
        month: aMo || (timing.parts ? timing.parts.month + 1 : 1),
        day: aDy || (timing.parts ? timing.parts.day : 1),
        years: years,
        milestone: years > 0 ? `${years} Years of Vivaha Harmony` : 'Marriage Anniversary',
        spouse: d1.spouseName,
        timing: timing
      });
    }
  }

  return merged;
}

// ----------------------------------------------------
// KPI STATS COMPUTATION
// ----------------------------------------------------
// ----------------------------------------------------
// AGE-WISE DEVOTEE DISTRIBUTION — LIVE counts from the Database
// (recomputed on every KPI refresh, so new devotees / age changes auto-update)
// ----------------------------------------------------
function getDevoteeAgeBuckets() {
  const buckets = { '0-25': 0, '26-50': 0, '51-60': 0, '60+': 0, unknown: 0 };
  state.devotees.forEach(d => {
    const age = calculateAge(d.dob);
    if (typeof age !== 'number' || !isFinite(age)) { buckets.unknown++; return; }
    if (age <= 25) buckets['0-25']++;        // 0–25 (25 included)
    else if (age <= 50) buckets['26-50']++;  // 26–50 (50 included)
    else if (age <= 60) buckets['51-60']++;  // 51–60 (60 included)
    else buckets['60+']++;                   // 61+ = Above 60
  });
  return buckets;
}

function ageGroupLabel(group) {
  return { '0-25': '0-25', '26-50': '25-50', '51-60': '50-60', '60+': 'Above 60' }[group] || group;
}

function updateAgeKpiCards() {
  const b = getDevoteeAgeBuckets();
  // Updates EVERY age card on every page (Dashboard + Directory) via data-age-stat
  document.querySelectorAll('[data-age-stat]').forEach(el => {
    const key = el.getAttribute('data-age-stat');
    if (key && b[key] !== undefined) el.innerText = b[key];
  });
  const seniorEl = document.getElementById('stat-senior-devotees');
  if (seniorEl) seniorEl.innerText = b['60+']; // Senior Vaishnavas card (60+) stays in sync
  return b;
}

function updateKPIs() {
  const totalDevotees = state.devotees.length;
  const totalDevoteesEl = document.getElementById('stat-total-devotees');
  if (totalDevoteesEl) totalDevoteesEl.innerText = totalDevotees;
  const totalCountEl = document.getElementById('total-count');
  if (totalCountEl) totalCountEl.innerText = totalDevotees;
  const pagTotalEl = document.getElementById('pagination-total-count');
  if (pagTotalEl) pagTotalEl.innerText = totalDevotees;

  // Birthdays & Initiation Anniversaries (individual devotees)
  let bdaysThisMonth = 0;
  let bdaysToday = 0;
  let initAnnivThisMonth = 0;

  state.devotees.forEach(d => {
    if (d.dob) {
      const timing = checkEventTiming(d.dob);
      if (timing.isThisMonth) bdaysThisMonth++;
      if (timing.isToday) bdaysToday++;
    }
    if (d.firstInitiationDate || d.initiationDate) {
      const initTiming = checkEventTiming(d.firstInitiationDate || d.initiationDate);
      if (initTiming.isThisMonth) initAnnivThisMonth++;
    }
  });

  // Marriage Anniversaries (COUPLE COUNT: Husband + Wife = 1 Couple)
  const annivCelebrations = getMergedAnniversaryCelebrations(state.devotees);
  let marriageAnnivThisMonth = 0;
  let annivToday = 0;

  annivCelebrations.forEach(c => {
    if (c.timing.isThisMonth) marriageAnnivThisMonth++;
    if (c.timing.isToday) annivToday++;
  });

  const bdayMonthEl = document.getElementById('stat-bday-month');
  if (bdayMonthEl) bdayMonthEl.innerText = bdaysThisMonth;
  const initEl = document.getElementById('stat-initiation-anniv');
  if (initEl) initEl.innerText = initAnnivThisMonth;
  const marrEl = document.getElementById('stat-marriage-anniv');
  if (marrEl) marrEl.innerText = marriageAnnivThisMonth;
  const quickBdayEl = document.getElementById('quick-bday-count');
  if (quickBdayEl) quickBdayEl.innerText = bdaysToday;

  // Header celebration badge
  const bdayBadge = document.getElementById('nav-bday-badge');
  if (bdayBadge) {
    if (bdaysToday > 0) {
      bdayBadge.innerText = `${bdaysToday} Today!`;
    } else {
      bdayBadge.innerText = `Wishes`;
    }
  }

  // Header anniversary badge (shows Couple count today!)
  const annivBadge = document.getElementById('nav-anniv-badge');
  if (annivBadge) {
    annivBadge.innerText = annivToday > 0 ? `${annivToday} Today!` : '💍';
  }

  // Logistics & Parcel Tracking KPIs — counted LIVE from the Delivery Tracking data
  const pStats = updateParcelKpiCards();

  // Age-wise Distribution cards (live) — Senior Vaishnavas (60+) included
  updateAgeKpiCards();

  // Tracking System Stats
  const trackTotalEl = document.getElementById('track-total');
  if (trackTotalEl) trackTotalEl.innerText = pStats.total;
  const trackTransitEl = document.getElementById('track-transit');
  if (trackTransitEl) trackTransitEl.innerText = pStats.out;
  const trackDeliveredEl = document.getElementById('track-delivered');
  if (trackDeliveredEl) trackDeliveredEl.innerText = pStats.delivered;
  const trackPendingEl = document.getElementById('track-pending');
  if (trackPendingEl) trackPendingEl.innerText = pStats.unverified;
  const trackReturnedEl = document.getElementById('track-returned');
  if (trackReturnedEl) trackReturnedEl.innerText = 0;

  // Total Anniversary
  const annivTotalEl = document.getElementById('stat-anniversary-total');
  if (annivTotalEl) annivTotalEl.innerText = marriageAnnivThisMonth;
}

// ----------------------------------------------------
// PARCEL TRACKING KPI CARDS — live counts from the Delivery Tracking parcel records
// ----------------------------------------------------
// DUPLICATE PARCEL PREVENTION & DETECTION SYSTEM
// Rule: One devotee should receive only one parcel per month,
// whether the parcel is created for a Birthday or Anniversary.
// ----------------------------------------------------
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getParcelMonthYear(p) {
  if (!p) return null;
  const raw = p.bookingDate || p.createdAt || p.parcelCreatedAt || p.dispatchedDate || p.deliveryDate;

  let y = null, m = null;
  if (raw) {
    if (typeof raw === 'string' && /^\d{4}-\d{2}/.test(raw)) {
      const parts = raw.split('T')[0].split('-');
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10); // 1-12
    } else {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        y = d.getFullYear();
        m = d.getMonth() + 1;
      }
    }
  }

  // Fallback: use current year and month so no parcel is un-grouped
  if (!y || !m || m < 1 || m > 12) {
    const dev = (state.devotees || []).find(d => d.id === p.devoteeId);
    const now = new Date();
    y = now.getFullYear();
    m = (dev && dev.birthMonth) ? parseInt(dev.birthMonth, 10) : (now.getMonth() + 1);
  }
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }

  return {
    year: y,
    month: m,
    monthName: MONTH_NAMES[m - 1],
    label: `${MONTH_NAMES[m - 1]} ${y}`
  };
}

function findDuplicateParcelForDevotee(devoteeId, targetYear, targetMonth, excludeParcelId = null) {
  if (!state.parcels || !state.parcels.length) return null;
  const targetY = parseInt(targetYear, 10);
  const targetM = parseInt(targetMonth, 10);
  if (!targetY || !targetM) return null;

  const dev = (state.devotees || []).find(d => d.id === devoteeId);
  const matchedSpouse = dev ? findMatchedSpouseDevotee(dev) : null;
  const devIds = new Set();
  if (devoteeId) devIds.add(devoteeId);
  if (dev && dev.id) devIds.add(dev.id);
  if (matchedSpouse && matchedSpouse.id) devIds.add(matchedSpouse.id);

  const cleanPhone = (dev && dev.phone) ? dev.phone.replace(/\D/g, '') : '';
  const spousePhone = (matchedSpouse && matchedSpouse.phone) ? matchedSpouse.phone.replace(/\D/g, '') : '';

  return state.parcels.find(p => {
    if (excludeParcelId && p.id === excludeParcelId) return false;

    // Check if parcel belongs to the same devotee or matched spouse
    const pDevId = p.devoteeId;
    let isSame = devIds.has(pDevId);
    if (!isSame && p.phone) {
      const pClean = p.phone.replace(/\D/g, '');
      if (cleanPhone && cleanPhone.length >= 10 && pClean === cleanPhone) isSame = true;
      if (spousePhone && spousePhone.length >= 10 && pClean === spousePhone) isSame = true;
    }
    if (!isSame) return false;

    const my = getParcelMonthYear(p);
    if (!my) return false;
    return my.year === targetY && my.month === targetM;
  }) || null;
}

function getParcelsDuplicateMap() {
  const map = new Map();
  const parcels = state.parcels || [];

  parcels.forEach(p => {
    const my = getParcelMonthYear(p);
    if (!my) return;

    const dev = (state.devotees || []).find(d => d.id === p.devoteeId);
    const spouse = dev ? findMatchedSpouseDevotee(dev) : null;
    let canonId = p.devoteeId || (dev && dev.id) || 'unknown';
    if (spouse && spouse.id && spouse.id < canonId) {
      canonId = spouse.id;
    }
    const key = `${canonId}-${my.year}-${my.month}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });

  const dupMap = new Map();
  map.forEach((list) => {
    if (list.length > 1) {
      list.forEach(p => {
        const other = list.filter(x => x.id !== p.id);
        const my = getParcelMonthYear(p);
        dupMap.set(p.id, {
          count: list.length,
          monthYearLabel: my ? my.label : '',
          otherParcels: other
        });
      });
    }
  });

  return dupMap;
}

// Compute retention scoring: highest score is preserved as primary, lower scores are marked as duplicates to delete
function getParcelRetentionScore(p) {
  if (!p) return 0;
  let score = 0;
  // 1. Delivery Status (Delivered is highest value)
  if (p.delivered === true || p.parcelStatus === 'DELIVERED') score += 1000;
  else if (p.parcelStatus === 'OUT_FOR_DELIVERY') score += 800;
  else if (p.parcelStatus === 'IN_TRANSIT') score += 700;
  else if (p.parcelStatus === 'PACKED_BLESSED' || p.parcelStatus === 'DISPATCHED') score += 600;
  else score += 100;

  // 2. Real courier tracking number (13-14 digits)
  const courierTrk = String(p.courierTrackingNo || '').trim();
  if (/^\d{10,15}$/.test(courierTrk)) score += 500;
  else if (courierTrk.length >= 8) score += 300;
  else if ((p.trackingId || '').trim().length >= 5) score += 10;

  // 3. Calling recorded
  if (p.preCalling === 'Yes' || p.postCalling === 'Yes') score += 200;

  // 4. Prefer Male / husband as primary household contact if tie
  const dev = (state.devotees || []).find(d => d.id === p.devoteeId);
  if (dev && dev.gender === 'Male') score += 20;

  // 5. Has phone / address data
  if (p.phone && p.phone.trim().length >= 10) score += 50;
  if (p.address && p.address.trim().length >= 10) score += 50;

  return score;
}

// Identifies all duplicate consignment groups and produces list of IDs to delete, keeping the best one in each group
function getDuplicateParcelsToDelete() {
  const map = new Map();
  const parcels = state.parcels || [];

  parcels.forEach(p => {
    const my = getParcelMonthYear(p);
    const dev = (state.devotees || []).find(d => d.id === p.devoteeId);
    const spouse = dev ? findMatchedSpouseDevotee(dev) : null;
    let canonId = p.devoteeId || (dev && dev.id) || 'unknown';
    if (spouse && spouse.id && spouse.id < canonId) {
      canonId = spouse.id;
    }
    const y = my ? my.year : new Date().getFullYear();
    const m = my ? my.month : (new Date().getMonth() + 1);

    const key = `${canonId}-${y}-${m}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });

  const duplicateGroups = [];
  const allIdsToDelete = [];

  map.forEach((list, key) => {
    if (list.length > 1) {
      // Sort: best retention parcel at index 0 (to KEEP)
      list.sort((a, b) => {
        const sa = getParcelRetentionScore(a);
        const sb = getParcelRetentionScore(b);
        if (sb !== sa) return sb - sa; // higher score first
        // If tied, keep earliest created or booked consignment
        const ta = a.createdAt || a.bookingDate || a.parcelCreatedAt || '';
        const tb = b.createdAt || b.bookingDate || b.parcelCreatedAt || '';
        if (ta && tb) {
          const da = new Date(ta).getTime();
          const db = new Date(tb).getTime();
          if (!isNaN(da) && !isNaN(db) && da !== db) return da - db;
        }
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      const keep = list[0];
      const toDelete = list.slice(1);
      toDelete.forEach(item => {
        if (item.id) allIdsToDelete.push(item.id);
      });

      const my = getParcelMonthYear(keep);
      duplicateGroups.push({
        key,
        monthLabel: my ? my.label : '',
        keep,
        toDelete
      });
    }
  });

  return { duplicateGroups, allIdsToDelete };
}

// Automatically delete duplicate parcels from Parcel Tracking tab, preserving the primary booking
async function deleteDuplicateParcels() {
  if (isViewer()) {
    showToast('⛔ Viewers cannot delete duplicate parcels.', 'error');
    return;
  }

  const { duplicateGroups, allIdsToDelete } = getDuplicateParcelsToDelete();
  if (!allIdsToDelete || allIdsToDelete.length === 0) {
    showToast('✅ No duplicate parcels found in tracking. Everything is clean!', 'success');
    updateParcelKpiCards();
    return;
  }

  const deleteCount = allIdsToDelete.length;
  const groupCount = duplicateGroups.length;

  const confirmed = await showAppConfirm({
    title: 'Delete Duplicate Consignments',
    message: `Found ${deleteCount} redundant duplicate parcel consignment${deleteCount > 1 ? 's' : ''} across ${groupCount} devotee/couple group${groupCount > 1 ? 's' : ''}.\n\n` +
             `The primary/original booking for each devotee will be safely kept. Only redundant extra copies will be permanently deleted.\n\n` +
             `Do you want to permanently delete these ${deleteCount} duplicate parcel${deleteCount > 1 ? 's' : ''}?`,
    confirmText: `Delete ${deleteCount} Duplicate${deleteCount > 1 ? 's' : ''}`,
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗑️'
  });
  if (!confirmed) return;

  // 1. Mark in tombstone set so they can NEVER resurrect
  markParcelsAsDeleted(allIdsToDelete);

  const idsToDeleteSet = new Set(allIdsToDelete);
  state.parcels = (state.parcels || []).filter(p => !idsToDeleteSet.has(p.id));

  // If any selected parcels were deleted, unselect them
  if (state.selectedParcels) {
    allIdsToDelete.forEach(id => state.selectedParcels.delete(id));
  }

  // Ensure devotee record mirrors the kept parcel
  duplicateGroups.forEach(g => {
    const keep = g.keep;
    const dev = (state.devotees || []).find(d => d.id === keep.devoteeId);
    if (dev) {
      dev.hasParcel = true;
      dev.parcelCreated = true;
      dev.parcelId = keep.id;
      if (keep.courierTrackingNo) dev.courierTrackingNo = keep.courierTrackingNo;
      if (keep.courierPartner) dev.courierPartner = keep.courierPartner;
    }
  });

  saveToStorage();
  try {
    localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels));
  } catch (e) { /* ignore */ }

  // 2. Direct delete from Supabase Cloud (AWAITED)
  try {
    const client = getSupabaseClient();
    if (client) {
      for (let i = 0; i < allIdsToDelete.length; i += 50) {
        const chunk = allIdsToDelete.slice(i, i + 50);
        const { error } = await client.from('parcels').delete().in('id', chunk);
        if (error) {
          console.warn('⚠️ Supabase duplicate delete warning:', error.message);
        }
      }
      console.log(`✅ Permanently deleted ${allIdsToDelete.length} duplicate parcels from Supabase Cloud.`);
    }
  } catch (e) {
    console.warn('Cloud duplicate delete error:', e);
  }

  logActivity('delete', 'Parcel', `Deleted ${deleteCount} duplicate parcel consignment(s) across ${groupCount} group(s).`);

  // If duplicate filter was active and now 0 duplicates, reset filter to ALL
  const pFilter = document.getElementById('parcel-filter-purpose');
  if (pFilter && pFilter.value === 'DUPLICATES') {
    pFilter.value = 'ALL';
  }

  updateKPIs();
  updateParcelKpiCards();
  renderParcelsTable();
  renderBirthdaysGrid();
  renderDevoteesTable();

  showToast(`✅ Successfully deleted ${deleteCount} duplicate parcel${deleteCount > 1 ? 's' : ''}! Original bookings preserved.`, 'success');
}

function showDuplicateParcelWarning(devotee, monthYearLabel, existingParcel, duplicateParcel = null) {
  const modal = document.getElementById('duplicate-parcel-modal');
  if (!modal) {
    alert(`⚠️ Duplicate Parcel Detected\nThis devotee already has a parcel booked for ${monthYearLabel}.`);
    return;
  }

  const dName = devotee ? (devotee.spiritualName ? `${devotee.spiritualName} (${devotee.legalName || ''})` : devotee.legalName) : (existingParcel ? (existingParcel.spiritualName || existingParcel.legalName || existingParcel.devoteeName) : 'This devotee');
  const dId = devotee ? devotee.id : (existingParcel ? existingParcel.devoteeId : 'N/A');
  const dPhone = devotee ? (devotee.phone || 'N/A') : (existingParcel ? (existingParcel.phone || 'N/A') : 'N/A');

  const pType = existingParcel ? (existingParcel.parcelType || existingParcel.eventType || 'Prasadam Parcel') : 'Prasadam Parcel';
  const pDate = existingParcel ? (existingParcel.bookingDate || (existingParcel.createdAt ? existingParcel.createdAt.split('T')[0] : '—')) : '—';
  const pTrk = existingParcel ? (existingParcel.courierTrackingNo || existingParcel.trackingId || 'Pending Tracking') : '—';
  const pStatus = existingParcel ? (existingParcel.delivered ? 'Delivered 🟢' : (existingParcel.parcelStatus || 'Packed & Dispatched 📦')) : 'Booked';

  const primaryMsg = document.getElementById('dp-modal-primary-message');
  if (primaryMsg) {
    primaryMsg.innerHTML = `This devotee already has a parcel booked for <strong>${escapeHtml(monthYearLabel)}</strong>.`;
  }
  const nameEl = document.getElementById('dp-modal-devotee-name');
  if (nameEl) nameEl.innerText = dName;
  const idEl = document.getElementById('dp-modal-devotee-id');
  if (idEl) idEl.innerText = dId;
  const phoneEl = document.getElementById('dp-modal-devotee-phone');
  if (phoneEl) phoneEl.innerText = dPhone;

  const typeEl = document.getElementById('dp-modal-existing-type');
  if (typeEl) typeEl.innerText = pType;
  const myEl = document.getElementById('dp-modal-existing-monthyear');
  if (myEl) myEl.innerText = monthYearLabel;
  const dateEl = document.getElementById('dp-modal-existing-bookingdate');
  if (dateEl) dateEl.innerText = pDate;
  const trkEl = document.getElementById('dp-modal-existing-tracking');
  if (trkEl) trkEl.innerText = pTrk;
  const statusEl = document.getElementById('dp-modal-existing-status');
  if (statusEl) statusEl.innerText = pStatus;

  const viewBtn = document.getElementById('dp-modal-view-btn');
  if (viewBtn && existingParcel) {
    viewBtn.onclick = () => {
      closeDuplicateParcelModal();
      switchTab('parcels');
      setTimeout(() => {
        const row = document.getElementById(`parcel-row-${existingParcel.id}`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('bg-amber-100/90', 'ring-2', 'ring-amber-500');
          setTimeout(() => {
            row.classList.remove('bg-amber-100/90', 'ring-2', 'ring-amber-500');
          }, 3500);
        }
      }, 350);
    };
  }

  // Direct delete button inside modal for duplicate consignment
  const delBtn = document.getElementById('dp-modal-delete-btn');
  if (delBtn) {
    const targetToDelete = duplicateParcel || existingParcel;
    if (targetToDelete && targetToDelete.id) {
      delBtn.classList.remove('hidden');
      delBtn.onclick = async () => {
        closeDuplicateParcelModal();
        await deleteParcelRecord(targetToDelete.id, targetToDelete.devoteeId);
      };
    } else {
      delBtn.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();

  showToast(`⚠️ Duplicate Parcel Detected: This devotee already has a parcel booked for ${monthYearLabel}.`, 'warning');
}

function closeDuplicateParcelModal() {
  const modal = document.getElementById('duplicate-parcel-modal');
  if (modal) modal.classList.add('hidden');
}

function showDuplicateParcelWarningForParcel(parcelId) {
  const p = (state.parcels || []).find(x => x.id === parcelId);
  if (!p) return;
  const dupMap = getParcelsDuplicateMap();
  const dupInfo = dupMap.get(parcelId);
  const my = getParcelMonthYear(p);
  const label = dupInfo ? dupInfo.monthYearLabel : (my ? my.label : 'this month');
  const other = (dupInfo && dupInfo.otherParcels && dupInfo.otherParcels[0]) || p;
  const dev = (state.devotees || []).find(d => d.id === p.devoteeId);
  showDuplicateParcelWarning(dev, label, other, p);
}

function handleParcelKpiDuplicateClick() {
  const pFilter = document.getElementById('parcel-filter-purpose');
  if (pFilter) {
    pFilter.value = (pFilter.value === 'DUPLICATES') ? 'ALL' : 'DUPLICATES';
    renderParcelsTable();
  }
}

// ----------------------------------------------------
// PARCEL TRACKING KPI CARDS — live counts from the Delivery Tracking parcel records
// (no duplicate data — every card is computed from state.parcels on the fly)
// ----------------------------------------------------
function computeParcelStats() {
  const parcels = state.parcels || [];
  let out = 0, delivered = 0, birthday = 0, anniversary = 0, unverified = 0;
  parcels.forEach(p => {
    const s = p.parcelStatus || '';
    if (!s || s === 'PACKED_BLESSED' || s === 'IN_TRANSIT' || s === 'OUT_FOR_DELIVERY') out++;
    if (p.delivered === true || s === 'DELIVERED') delivered++;

    const purpose = p.parcelType || p.eventType || '';
    if (purpose === 'Birthday') birthday++;
    else if (purpose === 'Anniversary') anniversary++;

    if (p.addressVerified === 'Needs Verification' || !p.addressVerified || (p.address && p.address.length < 15) || !p.pincode) unverified++;
  });
  const dupMap = getParcelsDuplicateMap();
  return { total: parcels.length, out, delivered, birthday, anniversary, unverified, duplicates: dupMap.size };
}

function updateParcelKpiCards() {
  const s = computeParcelStats();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  set('stat-parcel-total', s.total);
  set('stat-parcel-out', s.out);
  set('stat-parcel-delivered', s.delivered);
  set('stat-parcel-bday', s.birthday);
  set('stat-parcel-anniv', s.anniversary);
  set('stat-parcel-duplicates', s.duplicates);
  const pBadgeEl = document.getElementById('nav-parcel-badge');
  if (pBadgeEl) pBadgeEl.innerText = s.total;

  const banner = document.getElementById('parcel-duplicate-banner');
  const bannerCount = document.getElementById('parcel-duplicate-banner-count');
  const isDismissed = sessionStorage.getItem('parcel_duplicate_banner_dismissed') === 'true';
  if (banner) {
    if (s.duplicates > 0 && !isDismissed) {
      banner.classList.remove('hidden');
      if (bannerCount) bannerCount.innerText = `${s.duplicates} Entries`;
    } else {
      banner.classList.add('hidden');
    }
  }

  const toolbarBadge = document.getElementById('parcel-duplicate-count-badge');
  if (toolbarBadge) {
    if (s.duplicates > 0) {
      toolbarBadge.innerText = s.duplicates;
      toolbarBadge.classList.remove('hidden');
    } else {
      toolbarBadge.classList.add('hidden');
    }
  }

  return s;
}

function dismissDuplicateParcelBanner() {
  const banner = document.getElementById('parcel-duplicate-banner');
  if (banner) banner.classList.add('hidden');
  sessionStorage.setItem('parcel_duplicate_banner_dismissed', 'true');
  showToast('Duplicate parcel alert banner dismissed.', 'info');
}

// Highlight the active Purpose KPI card (Birthday / Anniversary / Duplicates) when its filter is applied
function updateParcelKpiCardHighlights(purpose) {
  const map = { Birthday: 'parcel-kpi-bday', Anniversary: 'parcel-kpi-anniv', DUPLICATES: 'parcel-kpi-duplicate' };
  Object.keys(map).forEach(k => {
    const card = document.getElementById(map[k]);
    if (!card) return;
    const active = (purpose === k);
    card.classList.toggle('ring-2', active);
    card.classList.toggle('ring-amber-400', active && k === 'DUPLICATES');
    card.classList.toggle('ring-emerald-400', active && k !== 'DUPLICATES');
  });
}

// Clicking the Birthday 🎂 / Anniversary 💍 KPI card filters the tracking table by that purpose
function handleParcelKpiPurposeClick(purpose) {
  const sel = document.getElementById('parcel-filter-purpose');
  if (!sel) return;
  sel.value = (purpose === 'ALL') ? 'ALL' : ((sel.value === purpose) ? 'ALL' : purpose);
  renderParcelsTable();
}

// ----------------------------------------------------
// DASHBOARD RENDERING & CHARTS
// ----------------------------------------------------
function renderDashboard() {
  // Upcoming Birthdays list widget (next 14 days)
  const bdayListContainer = document.getElementById('dashboard-upcoming-bdays-list');
  if (!bdayListContainer) return;

  const allUpcoming = getAllCelebrations()
    .filter(item => item.timing.daysRemaining !== null && item.timing.daysRemaining <= 14)
    .sort((a, b) => a.timing.daysRemaining - b.timing.daysRemaining);

  if (allUpcoming.length === 0) {
    bdayListContainer.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs">
        No devotee celebrations in the next 14 days.
      </div>
    `;
  } else {
    bdayListContainer.innerHTML = allUpcoming.slice(0, 7).map(item => {
      const d = item.devotee;
      const timing = item.timing;
      const name = d.spiritualName || d.legalName;
      let badge = '';
      if (timing.isToday) {
        badge = '<span class="bg-red-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full animate-pulse">🎉 Today!</span>';
      } else if (timing.isTomorrow) {
        badge = '<span class="bg-rose-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">Tomorrow</span>';
      } else {
        badge = `<span class="bg-slate-100 text-slate-600 font-semibold text-[10px] px-2 py-0.5 rounded-full">In ${timing.daysRemaining}d</span>`;
      }

      const photoHtml = getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[11px]');

      return `
        <div class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-pink-50/50 transition bg-slate-50/50">
          <div class="flex items-center space-x-3 overflow-hidden">
            ${photoHtml}
            <div class="overflow-hidden">
              <div class="font-bold text-slate-800 text-xs flex items-center space-x-1 truncate">
                <span class="truncate" title="${name}">${name}</span>
                <span class="text-[10px] text-slate-400 font-normal">(${item.label.split(' ')[0]})</span>
              </div>
              <div class="text-[11px] text-slate-500 truncate">
                ${formatDate(item.date)} • ${item.milestone}
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2 flex-shrink-0">
            ${badge}
            <button onclick="openWishesModal('${d.id}', '${item.eventType.toLowerCase()}')" class="bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 rounded-lg transition" title="Send WhatsApp Blessing">
              <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Live Prasadam Parcel Logistics Widget (auto-synced parcel records only)
  const parcelsListContainer = document.getElementById('dashboard-parcels-preview-list');
  if (parcelsListContainer) {
    const parcelRecords = state.parcels || [];
    if (parcelRecords.length === 0) {
      parcelsListContainer.innerHTML = '<div class="text-xs text-slate-400 p-2.5 border border-dashed border-slate-200 rounded-lg">No parcels yet — create them from the Birthday / Anniversary lists and they auto-appear here.</div>';
    } else {
      const activeParcels = parcelRecords.filter(p => p.parcelStatus === 'IN_TRANSIT' || p.parcelStatus === 'OUT_FOR_DELIVERY' || p.parcelStatus === 'PACKED_BLESSED').slice(0, 4);
      const displayList = activeParcels.length > 0 ? activeParcels : parcelRecords.slice(0, 4);

      parcelsListContainer.innerHTML = displayList.map(p => {
        const dev = state.devotees.find(x => x.id === p.devoteeId) || {};
        const name = dev.spiritualName || dev.legalName || p.devoteeName || 'Devotee';
        const status = p.parcelStatus || '';
        let statusColor = 'bg-slate-100 text-slate-600 border-slate-200';
        if (status === 'DELIVERED') statusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        else if (status === 'OUT_FOR_DELIVERY') statusColor = 'bg-purple-100 text-purple-800 border-purple-200';
        else if (status === 'PACKED_BLESSED') statusColor = 'bg-amber-100 text-amber-900 border-amber-200';

        return `
          <div class="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-sky-50/50 transition bg-slate-50/50">
            <div class="overflow-hidden pr-2">
              <div class="font-bold text-slate-800 text-xs truncate" title="${name}">${name}</div>
              <div class="text-[11px] text-slate-500 font-mono flex items-center space-x-1">
                <span>${p.courierTrackingNo || '—'}</span>
                <span>•</span>
                <span>${p.city || dev.city || 'Durgapur'}</span>
              </div>
            </div>
            <div class="flex items-center space-x-1.5 flex-shrink-0">
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusColor}">${p.parcelStatusText || '—'}</span>
              <button onclick="openParcelTrackerModal('${p.devoteeId}')" class="p-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition" title="Track Live">
                <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// Interactive Chart.js Initialization
function initCharts() {
  if (!window.Chart) return;

  // Chart 1: Ashrama Distribution
  const ashramaCounts = {
    Brahmachari: 0,
    Grihastha: 0,
    Vanaprastha: 0,
    Sannyasi: 0
  };
  state.devotees.forEach(d => {
    if (ashramaCounts[d.ashrama] !== undefined) {
      ashramaCounts[d.ashrama]++;
    }
  });

  const ctxAshrama = document.getElementById('ashramaChart');
  if (ctxAshrama) {
    if (state.charts.ashrama) state.charts.ashrama.destroy();
    state.charts.ashrama = new Chart(ctxAshrama, {
      type: 'doughnut',
      data: {
        labels: ['Brahmachari', 'Grihastha', 'Vanaprastha', 'Sannyasi'],
        datasets: [{
          data: [
            ashramaCounts.Brahmachari,
            ashramaCounts.Grihastha,
            ashramaCounts.Vanaprastha,
            ashramaCounts.Sannyasi
          ],
          backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 10 } }
          }
        },
        cutout: '65%'
      }
    });
  }

  // Chart 2: Parcel Logistics Status (Flipkart / Amazon Stepper)
  const parcelCounts = {
    'Delivered': 0,
    'Out for Delivery': 0,
    'In Transit': 0,
    'Altar Packed': 0,
    'Order Approved': 0
  };
  (state.parcels || []).forEach(p => {
    const s = p.parcelStatus || '';
    if (s === 'DELIVERED') parcelCounts['Delivered']++;
    else if (s === 'OUT_FOR_DELIVERY') parcelCounts['Out for Delivery']++;
    else if (s === 'IN_TRANSIT') parcelCounts['In Transit']++;
    else if (s === 'PACKED_BLESSED') parcelCounts['Altar Packed']++;
  });

  const ctxSastra = document.getElementById('sastraChart');
  if (ctxSastra) {
    if (state.charts.sastra) state.charts.sastra.destroy();
    state.charts.sastra = new Chart(ctxSastra, {
      type: 'doughnut',
      data: {
        labels: Object.keys(parcelCounts),
        datasets: [{
          data: Object.values(parcelCounts),
          backgroundColor: ['#10b981', '#a855f7', '#3b82f6', '#f59e0b', '#94a3b8'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, font: { size: 9 } }
          }
        },
        cutout: '60%'
      }
    });
  }
}

// ----------------------------------------------------
// DEVOTEE DIRECTORY MANAGEMENT
// ----------------------------------------------------
function renderDevoteesTable() {
  const tbody = document.getElementById('devotees-table-body');
  if (!tbody) return;

  populateCityFilter();

  const searchQuery = (document.getElementById('devotee-search')?.value || '').toLowerCase().trim();
  const filterCity = document.getElementById('filter-city')?.value || '';
  const filterMonth = document.getElementById('filter-month')?.value || '';
  const ageGroup = state.devoteeAgeGroup || '';

  const matchesAge = (d) => {
    if (!ageGroup) return true;
    const age = calculateAge(d.dob);
    if (typeof age !== 'number' || !isFinite(age)) return false;
    if (ageGroup === '0-25') return age <= 25;
    if (ageGroup === '26-50') return age > 25 && age <= 50;
    if (ageGroup === '51-60') return age > 50 && age <= 60;
    return age > 60; // '60+'
  };

  const filtered = state.devotees.filter(d => {
    const matchesSearch = !searchQuery ||
      (d.legalName && d.legalName.toLowerCase().includes(searchQuery)) ||
      (d.spiritualName && d.spiritualName.toLowerCase().includes(searchQuery)) ||
      (d.phone && d.phone.toLowerCase().includes(searchQuery)) ||
      (d.city && d.city.toLowerCase().includes(searchQuery)) ||
      (d.address && d.address.toLowerCase().includes(searchQuery)) ||
      (d.pincode && d.pincode.toLowerCase().includes(searchQuery)) ||
      (d.guru && d.guru.toLowerCase().includes(searchQuery)) ||
      (d.currentSeva && d.currentSeva.toLowerCase().includes(searchQuery)) ||
      (d.courierTrackingNo && d.courierTrackingNo.toLowerCase().includes(searchQuery)) ||
      (d.trackingId && d.trackingId.toLowerCase().includes(searchQuery));

    const matchesCity = !filterCity || (d.city && d.city.toLowerCase() === filterCity.toLowerCase());

    let matchesMonth = true;
    if (filterMonth) {
      const monthNum = parseInt(filterMonth);
      const dobParts = parseDateParts(d.dob);
      const annivParts = parseDateParts(d.anniversaryDate || d.anniversaryRaw || d.anniversary);
      // Month filter applies to BOTH Birthday and Anniversary
      matchesMonth = (dobParts && (dobParts.month + 1) === monthNum) ||
                     (annivParts && (annivParts.month + 1) === monthNum);
    }

    return matchesSearch && matchesCity && matchesMonth && matchesAge(d);
  });

  document.getElementById('filtered-count').innerText = filtered.length;

  // Age filter chip — visible only while an Age card filter is active
  const ageChip = document.getElementById('age-filter-chip');
  const ageChipLabel = document.getElementById('age-filter-chip-label');
  if (ageChip && ageChipLabel) {
    if (ageGroup) {
      ageChip.classList.remove('hidden');
      ageChip.classList.add('inline-flex');
      ageChipLabel.innerText = `Age ${ageGroupLabel(ageGroup)}`;
    } else {
      ageChip.classList.add('hidden');
      ageChip.classList.remove('inline-flex');
    }
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-slate-400">
          <div class="flex flex-col items-center space-y-1">
            <i data-lucide="user-x" class="w-8 h-8 text-slate-300"></i>
            <span class="font-semibold text-sm">No devotee records found matching your filters</span>
            <span class="text-xs">Try adjusting your search keywords or clear filters</span>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    renderPagination(0);
    return;
  }

  // Pagination
  const totalPages = Math.ceil(filtered.length / state.itemsPerPage);
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;

  const startIndex = (state.currentPage - 1) * state.itemsPerPage;
  const endIndex = Math.min(startIndex + state.itemsPerPage, filtered.length);
  const pageItems = filtered.slice(startIndex, endIndex);

  // Update page info
  const pageStartEl = document.getElementById('page-start');
  const pageEndEl = document.getElementById('page-end');
  const pagTotalEl = document.getElementById('pagination-total-count');
  if (pageStartEl) pageStartEl.innerText = filtered.length > 0 ? (startIndex + 1) : 0;
  if (pageEndEl) pageEndEl.innerText = endIndex;
  if (pagTotalEl) pagTotalEl.innerText = filtered.length;

  tbody.innerHTML = pageItems.map((d, idx) => {
    const displayName = d.spiritualName ? d.spiritualName : d.legalName;
    const secondaryName = d.spiritualName ? d.legalName : '';
    const serialNo = d.slNo || (startIndex + idx + 1);
    const isChecked = state.selectedDevotees.has(d.id);

    const bdayTiming = checkEventTiming(d.dob);
    let bdayPill = '';
    if (bdayTiming.isToday) {
      bdayPill = '<span class="bg-red-500 text-white font-bold text-[9px] px-1.5 py-0.2 rounded-full ml-1">Today!</span>';
    }

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${isChecked ? 'bg-teal-50/50' : ''}">
        <!-- Checkbox -->
        <td data-label="Select" class="py-3.5 px-3 text-center">
          <input type="checkbox" data-id="${d.id}" data-slno="${serialNo}" onchange="toggleDevoteeSelection('${d.id}', this.checked, this)" ${isChecked ? 'checked' : ''} class="devotee-row-checkbox w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer">
        </td>
        <!-- Serial Number -->
        <td data-label="#" class="py-3.5 px-3 text-center text-slate-700 font-bold font-mono text-xs">${serialNo}</td>
        <!-- Name Column -->
        <td data-label="Name" class="py-3.5 px-4 min-w-[200px]">
          <div class="flex items-center space-x-3">
            ${getDevoteeAvatarHtml(d, 'w-10 h-10', 'text-xs')}
            <div>
              <div class="font-bold text-slate-800 flex items-center space-x-1.5">
                <span class="cursor-pointer hover:text-teal-700 transition" onclick="viewDevoteeProfile('${d.id}')">${displayName}</span>
                ${bdayPill}
              </div>
              <div class="text-[11px] text-slate-400">${secondaryName}</div>
            </div>
          </div>
        </td>

        <!-- Marital Status Column (Married | Widow | Unmarried — change needs confirmation) -->
        <td data-label="Marital Status" class="py-3.5 px-3 whitespace-nowrap">
          ${buildMaritalStatusSelect(d)}
        </td>

        <!-- 4. City Column -->
        <td data-label="City" class="py-3.5 px-3 whitespace-nowrap">
          <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200/80">
            <i data-lucide="map-pin" class="w-3 h-3 text-teal-600"></i>
            <span>${d.city || 'N/A'}</span>
          </span>
        </td>

        <!-- 5. Address Column (verification is explicit — never derived from the address text) -->
        <td data-label="Address" class="py-3.5 px-4 min-w-[230px] max-w-sm">
          <div class="rounded-lg border p-2.5 transition ${isDevoteAddressVerified(d) ? 'bg-emerald-50 border-emerald-300' : (d.addressVerified ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}">
            ${isDevoteAddressVerified(d)
              ? '<div class="text-[10px] font-bold mb-1 text-emerald-700">✓ Verified</div>'
              : (d.addressVerified ? '<div class="text-[10px] font-bold mb-1 text-amber-700">Unverified</div>' : '')}
            <div class="text-xs font-bold text-slate-800 leading-snug">
              ${d.address || '<span class="text-slate-400 italic font-normal">No address recorded</span>'}
            </div>
          </div>
        </td>

        <!-- 6. Phone Column -->
        <td data-label="Phone" class="py-3.5 px-3 whitespace-nowrap">
          ${d.phone ? `
            <a href="tel:${d.phone}" class="font-medium text-slate-700 hover:text-teal-600 flex items-center space-x-1 transition" title="Call Devotee (${d.phone})">
              <span class="text-xs">📞</span>
              <span>${d.phone}</span>
            </a>
          ` : `<span class="text-slate-400">N/A</span>`}
        </td>

        <!-- 7. Action Column -->
        <td data-label="Action" class="py-3.5 px-4 text-right whitespace-nowrap">
          <div class="flex items-center justify-end space-x-1.5">
            <button onclick="editDevotee('${d.id}')" class="inline-flex items-center space-x-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 font-bold px-3 py-1.5 rounded-lg text-xs shadow-xs transition transform active:scale-95 cursor-pointer" title="✏️ Edit Devotee Profile">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              <span>Edit</span>
            </button>
            <button onclick="deleteDevotee('${d.id}')" class="inline-flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm transition transform active:scale-95 cursor-pointer" title="🗑️ Delete Devotee Record">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }

  renderPagination(totalPages);
  updateSelectAllCheckbox();
  updateSelectedCountUI();
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination-controls');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Previous button
  html += `<button onclick="goToPage(${state.currentPage - 1})" ${state.currentPage === 1 ? 'disabled' : ''} class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${state.currentPage === 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-200'}">‹ Previous</button>`;

  // Page numbers
  const maxVisible = 5;
  let startPage = Math.max(1, state.currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    html += `<button onclick="goToPage(1)" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition">1</button>`;
    if (startPage > 2) {
      html += `<span class="px-1 text-slate-400">…</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === state.currentPage
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-200';
    html += `<button onclick="goToPage(${i})" class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${activeClass}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      html += `<span class="px-1 text-slate-400">…</span>`;
    }
    html += `<button onclick="goToPage(${totalPages})" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition">${totalPages}</button>`;
  }

  // Next button
  html += `<button onclick="goToPage(${state.currentPage + 1})" ${state.currentPage === totalPages ? 'disabled' : ''} class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${state.currentPage === totalPages ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-200'}">Next ›</button>`;

  container.innerHTML = html;
}

function goToPage(page) {
  const totalPages = Math.ceil(state.devotees.length / state.itemsPerPage);
  if (page < 1 || page > totalPages) return;
  state.currentPage = page;
  renderDevoteesTable();
}

function toggleDevoteeSelection(devoteeId, checked, elem) {
  if (checked) {
    state.selectedDevotees.add(devoteeId);
    if (elem) elem.closest('tr')?.classList.add('bg-teal-50/50');
  } else {
    state.selectedDevotees.delete(devoteeId);
    if (elem) elem.closest('tr')?.classList.remove('bg-teal-50/50');
  }
  updateSelectAllCheckbox();
  updateSelectedCountUI();
}

function toggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('#devotees-table-body input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    const devoteeId = cb.getAttribute('data-id') || (cb.getAttribute('onchange')?.match(/'([^']+)'/)?.[1]);
    if (devoteeId) {
      if (checked) {
        state.selectedDevotees.add(devoteeId);
        cb.closest('tr')?.classList.add('bg-teal-50/50');
      } else {
        state.selectedDevotees.delete(devoteeId);
        cb.closest('tr')?.classList.remove('bg-teal-50/50');
      }
    }
  });
  updateSelectAllCheckbox();
  updateSelectedCountUI();
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('select-all-checkbox');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#devotees-table-body input[type="checkbox"]');
  if (checkboxes.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function updateSelectedCountUI() {
  const count = state.selectedDevotees ? state.selectedDevotees.size : 0;
  
  // Badge on "Export Selected to PDF" button
  const btnBadge = document.getElementById('selected-devotee-badge');
  if (btnBadge) {
    if (count > 0) {
      btnBadge.innerText = count;
      btnBadge.classList.remove('hidden');
    } else {
      btnBadge.classList.add('hidden');
    }
  }

  // Badge in filter summary
  const summaryBadge = document.getElementById('selection-count-badge');
  const countNumber = document.getElementById('selected-count-number');
  if (summaryBadge && countNumber) {
    if (count > 0) {
      countNumber.innerText = count;
      summaryBadge.classList.remove('hidden');
      summaryBadge.classList.add('inline-flex');
    } else {
      summaryBadge.classList.add('hidden');
      summaryBadge.classList.remove('inline-flex');
    }
  }

  updateSelectAllBanner();
}

function clearDevoteeSelection() {
  if (state.selectedDevotees) {
    state.selectedDevotees.clear();
  }
  const checkboxes = document.querySelectorAll('#devotees-table-body input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    cb.closest('tr')?.classList.remove('bg-teal-50/50');
  });
  updateSelectAllCheckbox();
  updateSelectedCountUI();
  showToast('Devotee selection cleared.', 'info');
}

// "Select all across every page" — ticks every devotee that matches the
// current filters (search / city / month / age), not just the visible page.
function selectAllFilteredDevotees() {
  const list = getFilteredDirectoryDevotees();
  if (!list.length) { showToast('No devotees match the current filters.', 'info'); return; }
  list.forEach(d => state.selectedDevotees.add(d.id));
  renderDevoteesTable();
  updateSelectedCountUI();
  showToast(`Selected all ${list.length} matching devotee(s) — now click Export Selected PDF.`, 'success');
}

// Contextual helper shown above the table:
//  • whole page ticked and more pages exist → offer "Select all N matching"
//  • every matching devotee selected        → offer "Clear selection"
function updateSelectAllBanner() {
  const banner = document.getElementById('devotee-select-all-banner');
  if (!banner) return;
  const total = getFilteredDirectoryDevotees().length;
  const selected = state.selectedDevotees ? state.selectedDevotees.size : 0;

  let html = '';
  if (total > 0 && selected >= total) {
    html = `<span>All <strong>${total}</strong> matching devotee(s) are selected.</span>
      <button onclick="clearDevoteeSelection()" class="text-teal-700 underline font-bold">Clear selection</button>`;
  } else if (total > 0) {
    html = `<span>${selected > 0 ? `${selected} of <strong>${total}</strong> matching devotee(s) selected` : `<strong>${total}</strong> matching devotee(s) — pick them all for a PDF`}.</span>
      <button onclick="selectAllFilteredDevotees()" class="text-teal-700 underline font-bold">Select all ${total} matching</button>`;
  }

  if (html) {
    banner.innerHTML = html;
    banner.classList.remove('hidden');
    banner.classList.add('flex');
  } else {
    banner.innerHTML = '';
    banner.classList.add('hidden');
    banner.classList.remove('flex');
  }
}

// ----------------------------------------------------
// CELEBRATION TAB SELECTION SYSTEM (mirrors Devotee Directory)
// ----------------------------------------------------
function toggleCelebrationSelection(devoteeId, checked, elem) {
  if (checked) {
    state.selectedCelebrations.add(devoteeId);
    if (elem) elem.closest('tr')?.classList.add('bg-pink-50/40');
  } else {
    state.selectedCelebrations.delete(devoteeId);
    if (elem) elem.closest('tr')?.classList.remove('bg-pink-50/40');
  }
  updateCelebrationSelectAllCheckbox();
  updateCelebrationSelectionUI();
}

function toggleSelectAllCelebrations(checked) {
  document.querySelectorAll('#bday-table-body .celebration-row-checkbox').forEach(cb => {
    cb.checked = checked;
    const devoteeId = cb.getAttribute('data-id');
    if (!devoteeId) return;
    if (checked) {
      state.selectedCelebrations.add(devoteeId);
      cb.closest('tr')?.classList.add('bg-pink-50/40');
    } else {
      state.selectedCelebrations.delete(devoteeId);
      cb.closest('tr')?.classList.remove('bg-pink-50/40');
    }
  });
  updateCelebrationSelectAllCheckbox();
  updateCelebrationSelectionUI();
}

function updateCelebrationSelectAllCheckbox() {
  const selectAll = document.getElementById('bday-select-all-checkbox');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#bday-table-body .celebration-row-checkbox');
  if (checkboxes.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function updateCelebrationSelectionUI() {
  const count = state.selectedCelebrations ? state.selectedCelebrations.size : 0;
  const countEl = document.getElementById('bday-selected-count');
  if (countEl) countEl.innerText = count;
  const bar = document.getElementById('bday-bulk-bar');
  if (bar) {
    if (count > 0) {
      bar.classList.remove('hidden');
      bar.classList.add('flex');
    } else {
      bar.classList.add('hidden');
      bar.classList.remove('flex');
    }
  }
}

function clearCelebrationSelection() {
  if (state.selectedCelebrations) state.selectedCelebrations.clear();
  document.querySelectorAll('#bday-table-body .celebration-row-checkbox').forEach(cb => {
    cb.checked = false;
    cb.closest('tr')?.classList.remove('bg-pink-50/40');
  });
  updateCelebrationSelectAllCheckbox();
  updateCelebrationSelectionUI();
  showToast('Celebration selection cleared.', 'info');
}

async function bulkCreateParcelsForSelected() {
  if (!requirePermission('create_parcels', 'create parcels in bulk')) return;
  if (!state.selectedCelebrations || state.selectedCelebrations.size === 0) {
    showToast('Please select at least one devotee using the ☑ checkbox on the list.', 'warning');
    return;
  }
  const selectedDevotees = state.devotees.filter(d => state.selectedCelebrations.has(d.id));
  if (selectedDevotees.length === 0) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const parts = todayStr.split('-');
  const targetYear = parseInt(parts[0], 10);
  const targetMonth = parseInt(parts[1], 10);
  const monthYearLabel = `${MONTH_NAMES[targetMonth - 1]} ${targetYear}`;

  // Check for duplicates before creation
  const duplicateDevotees = [];
  const eligibleDevotees = [];

  selectedDevotees.forEach(d => {
    const dup = findDuplicateParcelForDevotee(d.id, targetYear, targetMonth);
    if (dup) {
      duplicateDevotees.push({ devotee: d, duplicateParcel: dup });
    } else {
      eligibleDevotees.push(d);
    }
  });

  if (eligibleDevotees.length === 0) {
    // All selected devotees already have a parcel for this month
    if (duplicateDevotees.length === 1) {
      showDuplicateParcelWarning(duplicateDevotees[0].devotee, monthYearLabel, duplicateDevotees[0].duplicateParcel);
    } else {
      showDuplicateParcelWarning(duplicateDevotees[0].devotee, monthYearLabel, duplicateDevotees[0].duplicateParcel);
      showToast(`⚠️ Duplicate Parcel Detected: All ${duplicateDevotees.length} selected devotees already have parcels booked for ${monthYearLabel}.`, 'warning');
    }
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Bulk Create Parcel',
    message: duplicateDevotees.length > 0
      ? `Create prasadam parcels for ${eligibleDevotees.length} eligible devotee(s)?\n\n⚠️ ${duplicateDevotees.length} devotee(s) already have a parcel booked for ${monthYearLabel} and will be skipped to prevent duplicates.`
      : `Create prasadam parcels for ${selectedDevotees.length} selected devotee(s) in one go?`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    icon: '📦',
    isDanger: false
  });
  if (!confirmed) return;

  const parcelType = state.celebrationEventType === 'MARRIAGE' ? 'Anniversary' : 'Birthday';
  const exp = new Date(todayStr);
  exp.setDate(exp.getDate() + 4);
  const expectedDeliveryDate = exp.toISOString().split('T')[0];
  if (!state.parcels) state.parcels = [];

  let created = 0;
  eligibleDevotees.forEach(d => {
    d.parcelCreated = true;
    d.hasParcel = true;
    d.parcelCreatedAt = new Date().toISOString();
    d.parcelType = parcelType;
    if (d.deliveryMode === 'SELF') d.courierPartner = 'Self Pickup';
    else if (d.deliveryMode === 'DELHIVERY') d.courierPartner = 'Delhivery';
    d.courierTrackingNo = ''; // blank at creation — added manually later
    if (d.deliveryMode === 'SELF') { d.preCalling = 'Yes'; d.postCalling = 'No'; } // Self Mode: Pre ON, Post OFF (locked)
    d.trackingId = d.trackingId || `ISK713204-${String(d.slNo || 1).padStart(3, '0')}`;
    d.bookingDate = todayStr;
    d.expectedDeliveryDate = expectedDeliveryDate;

    const record = {
      id: `PARCEL-${d.id}-${Date.now()}`,
      devoteeId: d.id,
      devoteeName: d.spiritualName || d.legalName,
      spiritualName: d.spiritualName || '',
      legalName: d.legalName || '',
      phone: d.phone,
      address: d.address,
      city: d.city,
      pincode: d.pincode,
      addressVerified: d.addressVerified || '',
      dob: d.dob,
      birthdayRaw: d.birthdayRaw,
      anniversaryDate: d.anniversaryDate,
      parcelType: parcelType,
      parcelDescription: d.parcelDescription || 'Sanctified Sri Sri Radha Madan Mohan Maha-Prasadam Laddu, Tulasi Leaves, Sacred Kalash Blessings & Srimad Bhagavad-gita',
      courierPartner: d.courierPartner || '',
      courierTrackingNo: '',
      preCalling: d.preCalling || '',
      postCalling: d.postCalling || '',
      trackingId: d.trackingId,
      bookingDate: todayStr,
      expectedDeliveryDate: expectedDeliveryDate,
      remarks: d.remarks || 'Handle with utmost care, sacred deity offering. Call devotee before delivery.',
      createdAt: new Date().toISOString()
    };

    state.parcels.unshift(record);
    created++;
  });

  saveToStorage();
  updateKPIs();
  renderBirthdaysGrid();
  renderDevoteesTable();
  renderParcelsTable();
  clearCelebrationSelection();

  if (duplicateDevotees.length > 0) {
    showToast(`✅ ${created} parcel(s) created! ⚠️ Skipped ${duplicateDevotees.length} duplicate(s) already booked for ${monthYearLabel}.`, 'warning');
  } else {
    showToast(`✅ ${created} parcel(s) created successfully!`, 'success');
  }
}

// Bulk parcel creation happens from the Birthday / Anniversary celebration lists
// (bulk bar → + Bulk Create Parcel) — not from the Parcel & Tracking page.

function populateCityFilter() {
  const citySelect = document.getElementById('filter-city');
  if (!citySelect) return;

  const currentVal = citySelect.value;
  const cities = [...new Set(state.devotees.map(d => d.city).filter(c => c && c.trim()))].sort((a, b) => a.localeCompare(b));

  citySelect.innerHTML = '<option value="">All Cities</option>';
  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });

  if (currentVal && cities.includes(currentVal)) {
    citySelect.value = currentVal;
  }
}

function clearAllParcelData() {
  if (!requirePermission('manage_settings', 'clear all parcel data')) return;
  if (!confirm('Are you sure you want to permanently DELETE ALL parcel records & clear every devotee parcel trace? This cannot be undone.')) return;

  // Permanent delete of every parcel entry (records + devotee traces)
  state.parcels = [];
  if (state.selectedParcels) state.selectedParcels.clear();
  (state.devotees || []).forEach(clearDevoteeParcelTrace);

  saveToStorage();
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  initCharts();
  showToast('All parcel records deleted permanently! Parcel Tracking is now empty.', 'success');
}

function resetDevoteeFilters() {
  state.currentPage = 1;
  state.selectedDevotees.clear();
  state.devoteeAgeGroup = null;
  const search = document.getElementById('devotee-search');
  if (search) search.value = '';
  const c = document.getElementById('filter-city');
  if (c) c.value = '';
  const m = document.getElementById('filter-month');
  if (m) m.value = '';
  renderDevoteesTable();
}

// Clicking an Age card on the Dashboard opens the Directory filtered to that age range.
// The selected age + any search/city/month filters work together (cumulative).
function filterDevoteesByAge(group) {
  if (!['0-25', '26-50', '51-60', '60+'].includes(group)) return;
  state.devoteeAgeGroup = group;
  state.currentPage = 1;
  const search = document.getElementById('devotee-search');
  if (search) search.value = '';
  const c = document.getElementById('filter-city');
  if (c) c.value = '';
  const m = document.getElementById('filter-month');
  if (m) m.value = '';
  renderDevoteesTable();
  switchTab('devotees');
  showToast(`Showing devotees aged ${ageGroupLabel(group)}`, 'info');
}

function clearDevoteeAgeFilter() {
  state.devoteeAgeGroup = null;
  state.currentPage = 1;
  renderDevoteesTable();
}

// ----------------------------------------------------
// DEVOTEE MODAL CREATE / EDIT
// ----------------------------------------------------
function openDevoteeModal(devoteeId = null) {
  const modal = document.getElementById('devotee-modal');
  const form = document.getElementById('devotee-form');
  form.reset();
  syncAllCallingToggles();
  setDevoteeFormTab('basic');
  setDevoteeFormMode('full');
  const subTitle = document.getElementById('devotee-modal-subtitle');
  if (subTitle) subTitle.innerText = 'Devotee Master Registry Form';
  const bannerName = document.getElementById('df-edit-banner-name');
  if (bannerName) bannerName.innerText = '';

  if (devoteeId) {
    const d = state.devotees.find(x => x.id === devoteeId);
    if (d) {
      document.getElementById('devotee-modal-title').innerText = 'Edit Devotee Profile';
      document.getElementById('save-devotee-btn-text').innerText = 'Update Devotee Profile';
      document.getElementById('devotee-id').value = d.id;

      // Edit mode = compact update window (Address, Mobile, Birthday & Anniversary)
      setDevoteeFormMode('contact');
      if (subTitle) subTitle.innerText = 'Update Address, Mobile & Celebration Dates';
      if (bannerName) bannerName.innerText = d.spiritualName || d.legalName || '';

      // Populate Basic
      document.getElementById('df-legal-name').value = d.legalName || '';
      document.getElementById('df-spiritual-name').value = d.spiritualName || '';
      document.getElementById('df-gender').value = d.gender || 'Male';
      document.getElementById('df-dob').value = toIsoDateInput(d.dob || d.birthdayRaw || d.birthday);
      const annivEl = document.getElementById('df-anniversary');
      if (annivEl) {
        annivEl.value = toIsoDateInput(d.anniversaryDate || d.anniversaryRaw || d.anniversary);
      }
      document.getElementById('df-ashrama').value = d.ashrama || 'Grihastha';
      // Marital Status: normalize legacy values (Single→Unmarried, Widowed→Widow);
      // any other value not in the canonical set is preserved as a "keep as-is" option.
      const maritalEl = document.getElementById('df-marital');
      if (maritalEl) {
        maritalEl.querySelectorAll('option[data-legacy]').forEach(o => o.remove());
        const rawMarital = d.maritalStatus || '';
        const normMarital = normalizeMarital(rawMarital);
        if (normMarital) {
          maritalEl.value = normMarital;
        } else if (rawMarital) {
          const legacyOpt = document.createElement('option');
          legacyOpt.value = rawMarital;
          legacyOpt.textContent = rawMarital + ' (keep as-is)';
          legacyOpt.disabled = true;
          legacyOpt.selected = true;
          legacyOpt.dataset.legacy = '1';
          maritalEl.prepend(legacyOpt);
          maritalEl.value = rawMarital;
        } else {
          // No value on the record → keep the neutral placeholder (never assume Unmarried).
          maritalEl.value = '';
        }
      }
      document.getElementById('df-phone').value = d.phone || '';
      document.getElementById('df-whatsapp').value = d.whatsapp || '';
      document.getElementById('df-email').value = d.email || '';
      document.getElementById('df-address').value = d.address || '';
      document.getElementById('df-city').value = d.city || '';
      document.getElementById('df-emergency-name').value = d.emergencyName || '';
      document.getElementById('df-emergency-phone').value = d.emergencyPhone || '';
      if (document.getElementById('df-photo')) {
        document.getElementById('df-photo').value = d.photo || d.photoDirect || '';
      }

      // Spiritual
      document.getElementById('df-initiation-status').value = d.initiationStatus || 'Harinama';
      document.getElementById('df-guru').value = d.guru || '';
      document.getElementById('df-initiation-date').value = d.initiationDate || '';
      document.getElementById('df-brahmana-date').value = d.brahmanaDate || '';
      document.getElementById('df-initiation-place').value = d.initiationPlace || '';
      document.getElementById('df-japa-rounds').value = d.japaRounds || 16;

      // Degrees
      const degs = d.degrees || [];
      document.getElementById('df-deg-bs').checked = degs.includes('Bhakti Shastri');
      document.getElementById('df-deg-bv').checked = degs.includes('Bhakti Vaibhava');
      document.getElementById('df-deg-bved').checked = degs.includes('Bhakti Vedanta');
      document.getElementById('df-deg-bsar').checked = degs.includes('Bhakti Sarvabhauma');

      // Health
      document.getElementById('df-blood-group').value = d.bloodGroup || 'Unknown';
      document.getElementById('df-blood-donor').value = d.isBloodDonor || 'No';
      document.getElementById('df-insurance').value = d.insurance || '';
      document.getElementById('df-medical-conditions').value = d.medicalConditions || '';
      document.getElementById('df-medications').value = d.medications || '';

      // Counselor
      document.getElementById('df-counselor').value = d.counselor || '';
      document.getElementById('df-counselor-group').value = d.counselorGroup || '';
      document.getElementById('df-current-seva').value = d.currentSeva || '';
      document.getElementById('df-profession').value = d.profession || '';
      document.getElementById('df-notes').value = d.notes || '';
    }
  } else {
    document.getElementById('devotee-modal-title').innerText = 'Add New Devotee Profile';
    document.getElementById('save-devotee-btn-text').innerText = 'Save Devotee Record';
    document.getElementById('devotee-id').value = '';
    const annivEl = document.getElementById('df-anniversary');
    if (annivEl) annivEl.value = '';
    if (document.getElementById('df-photo')) {
      document.getElementById('df-photo').value = '';
    }
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeDevoteeModal() {
  document.getElementById('devotee-modal').classList.add('hidden');
}

function setDevoteeFormTab(tab) {
  const tabs = ['basic', 'spiritual', 'health', 'counselor'];
  tabs.forEach(t => {
    const el = document.getElementById(`ftab-${t}`);
    if (el) {
      if (t === tab) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  document.querySelectorAll('.form-subtab').forEach(b => {
    if (b.getAttribute('data-ftab') === tab) {
      b.className = 'form-subtab font-semibold pb-2 border-b-2 border-teal-600 text-teal-700';
    } else {
      b.className = 'form-subtab font-semibold pb-2 border-b-2 border-transparent text-slate-500 hover:text-slate-800';
    }
  });
}

// Compact "Address, Phone, Birthday & Anniversary" edit mode — hides locked
// administrative profile fields so the Edit window stays clean & focused on essentials.
let devoteeEditHiddenCells = [];

function setDevoteeFormMode(mode) {
  const tabsBar = document.getElementById('df-form-tabs');
  const photoGroup = document.getElementById('df-group-photo');
  const emergencyGroup = document.getElementById('df-group-emergency');
  const banner = document.getElementById('df-edit-banner');
  const card = document.getElementById('devotee-modal-card');

  if (mode === 'contact') {
    if (tabsBar) tabsBar.classList.add('hidden');
    if (photoGroup) photoGroup.classList.add('hidden');
    if (emergencyGroup) emergencyGroup.classList.add('hidden');
    if (banner) banner.classList.remove('hidden');
    if (card) { card.classList.remove('max-w-4xl'); card.classList.add('max-w-xl'); }
    setDevoteeFormTab('basic');

    // Remove required validation from fields hidden in edit mode so native browser validation doesn't block submission
    const legalEl = document.getElementById('df-legal-name');
    if (legalEl) legalEl.removeAttribute('required');
    const genderEl = document.getElementById('df-gender');
    if (genderEl) genderEl.removeAttribute('required');

    // Hide locked administrative Basic-tab fields (keep Birthday, Anniversary, Phone, Address, City visible)
    devoteeEditHiddenCells = [];
    ['df-legal-name', 'df-spiritual-name', 'df-gender', 'df-ashrama', 'df-marital', 'df-email']
      .forEach(id => {
        const el = document.getElementById(id);
        const cell = el ? el.closest('div') : null;
        if (cell) {
          cell.classList.add('hidden');
          devoteeEditHiddenCells.push(cell);
        }
      });
  } else {
    if (tabsBar) tabsBar.classList.remove('hidden');
    if (photoGroup) photoGroup.classList.remove('hidden');
    if (emergencyGroup) emergencyGroup.classList.remove('hidden');
    if (banner) banner.classList.add('hidden');
    if (card) { card.classList.add('max-w-4xl'); card.classList.remove('max-w-xl'); }
    const legalEl = document.getElementById('df-legal-name');
    if (legalEl) legalEl.setAttribute('required', 'true');
    const genderEl = document.getElementById('df-gender');
    if (genderEl) genderEl.setAttribute('required', 'true');
    devoteeEditHiddenCells.forEach(c => c.classList.remove('hidden'));
    devoteeEditHiddenCells = [];
  }
}

function saveDevotee(event) {
  event.preventDefault();
  if (!requirePermission('edit_devotees', 'add or edit devotee records')) return;
  const devoteeId = document.getElementById('devotee-id').value;

  const degrees = [];
  if (document.getElementById('df-deg-bs').checked) degrees.push('Bhakti Shastri');
  if (document.getElementById('df-deg-bv').checked) degrees.push('Bhakti Vaibhava');
  if (document.getElementById('df-deg-bved').checked) degrees.push('Bhakti Vedanta');
  if (document.getElementById('df-deg-bsar').checked) degrees.push('Bhakti Sarvabhauma');

  const photoInputVal = document.getElementById('df-photo')?.value.trim() || '';
  const driveId = extractGoogleDriveFileId(photoInputVal);
  const photoDirectVal = driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : photoInputVal;

  const dobVal = document.getElementById('df-dob')?.value.trim() || '';
  const annivVal = document.getElementById('df-anniversary')?.value.trim() || '';
  const bParts = parseDateParts(dobVal);
  const aParts = parseDateParts(annivVal);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bRawFormatted = bParts ? `${String(bParts.day).padStart(2, '0')}-${monthNames[bParts.month]}-${bParts.year}` : (dobVal || '');
  const aRawFormatted = aParts ? `${String(aParts.day).padStart(2, '0')}-${monthNames[aParts.month]}-${aParts.year}` : (annivVal || '');

  const devoteeData = {
    id: devoteeId || `DEV-${Date.now().toString().slice(-5)}`,
    legalName: document.getElementById('df-legal-name').value.trim(),
    spiritualName: document.getElementById('df-spiritual-name').value.trim(),
    gender: document.getElementById('df-gender').value,
    dob: dobVal,
    birthdayRaw: bRawFormatted,
    birthday: bRawFormatted,
    bDay: bParts ? bParts.day : null,
    bMonth: bParts ? bParts.month + 1 : null,
    bYear: bParts ? bParts.year : null,
    birthDay: bParts ? bParts.day : null,
    birthMonth: bParts ? bParts.month + 1 : null,
    birthYear: bParts ? bParts.year : null,
    anniversaryDate: annivVal,
    anniversaryRaw: aRawFormatted,
    anniversary: aRawFormatted,
    aDay: aParts ? aParts.day : null,
    aMonth: aParts ? aParts.month + 1 : null,
    aYear: aParts ? aParts.year : null,
    ashrama: document.getElementById('df-ashrama').value,
    maritalStatus: document.getElementById('df-marital').value,
    phone: document.getElementById('df-phone').value.trim(),
    whatsapp: document.getElementById('df-whatsapp').value.trim(),
    email: document.getElementById('df-email').value.trim(),
    address: document.getElementById('df-address').value.trim(),
    city: document.getElementById('df-city').value.trim(),
    photo: photoInputVal,
    photoDirect: photoDirectVal,
    emergencyName: document.getElementById('df-emergency-name').value.trim(),
    emergencyPhone: document.getElementById('df-emergency-phone').value.trim(),
    initiationStatus: document.getElementById('df-initiation-status').value,
    guru: document.getElementById('df-guru').value.trim(),
    initiationDate: document.getElementById('df-initiation-date').value,
    brahmanaDate: document.getElementById('df-brahmana-date').value,
    initiationPlace: document.getElementById('df-initiation-place').value.trim(),
    japaRounds: parseInt(document.getElementById('df-japa-rounds').value) || 16,
    degrees: degrees,
    bloodGroup: document.getElementById('df-blood-group').value,
    isBloodDonor: document.getElementById('df-blood-donor').value,
    insurance: document.getElementById('df-insurance').value.trim(),
    medicalConditions: document.getElementById('df-medical-conditions').value.trim(),
    medications: document.getElementById('df-medications').value.trim(),
    counselor: document.getElementById('df-counselor').value.trim(),
    counselorGroup: document.getElementById('df-counselor-group').value.trim(),
    currentSeva: document.getElementById('df-current-seva').value.trim(),
    profession: document.getElementById('df-profession').value.trim(),
    notes: document.getElementById('df-notes').value.trim()
  };

  let oldSnapshot = null;
  let targetRecord = devoteeData;

  if (devoteeId) {
    const idx = state.devotees.findIndex(x => x.id === devoteeId);
    if (idx !== -1) {
      const existing = state.devotees[idx];
      oldSnapshot = { ...existing };
      const finalPhoto = photoInputVal || existing.photo || '';
      const finalDriveId = extractGoogleDriveFileId(finalPhoto);
      const finalPhotoDirect = finalDriveId ? `https://lh3.googleusercontent.com/d/${finalDriveId}` : (existing.photoDirect || finalPhoto);
      state.devotees[idx] = {
        ...existing,
        ...devoteeData,
        photo: finalPhoto,
        photoDirect: finalPhotoDirect
      };
      targetRecord = state.devotees[idx];
      showToast('Devotee profile updated successfully!', 'success');
    }
  } else {
    state.devotees.unshift(devoteeData);
    showToast('New devotee registered successfully!', 'success');
  }

  const _actName = targetRecord.spiritualName || targetRecord.legalName || 'devotee';
  
  // Record audit event with diff data
  recordAuditEvent({
    action: devoteeId ? 'edit' : 'create',
    module: 'devotees',
    recordId: targetRecord.id,
    summary: devoteeId ? `Updated devotee profile "${_actName}".` : `Registered new devotee "${_actName}".`,
    result: 'SUCCESS',
    oldValues: oldSnapshot,
    newValues: { ...targetRecord }
  });

  // Centralized Database: Push record directly to Supabase cloud
  syncDevoteeRecordToCloud(targetRecord);

  saveToStorage();
  updateDevoteeAutocompleteList();
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  initCharts();
  closeDevoteeModal();
}

// ----------------------------------------------------
// MARITAL STATUS — inline table dropdown (Married | Widow | Unmarried)
// A change is never applied directly: Cancel/Confirm dialog first,
// and Cancel restores the previous value.
// ----------------------------------------------------
const MARITAL_OPTIONS = ['Married', 'Widow', 'Unmarried'];
const LEGACY_MARITAL_MAP = { Single: 'Unmarried', Widowed: 'Widow' };

function normalizeMarital(value) {
  return LEGACY_MARITAL_MAP[value] || (MARITAL_OPTIONS.includes(value) ? value : '');
}

function buildMaritalStatusSelect(d) {
  const raw = d.maritalStatus || '';
  const sel = normalizeMarital(raw);
  let opts = '';
  if (!sel) {
    const label = raw ? escapeHtml(raw) : '— Select —';
    opts += `<option value="" disabled selected>${label}</option>`;
  }
  MARITAL_OPTIONS.forEach(o => {
    opts += `<option value="${o}" ${sel === o ? 'selected' : ''}>${o}</option>`;
  });
  return `<select data-prev="${escapeHtml(raw)}" onchange="handleMaritalStatusChange('${d.id}', this)"
      class="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-400 cursor-pointer">${opts}</select>`;
}

async function handleMaritalStatusChange(devoteeId, selectEl) {
  if (!requirePermission('edit_devotees', 'change marital status')) return;
  const prevRaw = selectEl.getAttribute('data-prev') || '';
  const newVal = selectEl.value;
  if (!newVal || newVal === '__keep__' || newVal === normalizeMarital(prevRaw)) return;

  const confirmed = await showAppConfirm({
    title: 'Marital Status Confirmation',
    message: `Are you sure you want to change Marital Status to ${newVal}?`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    icon: '❤️',
    isDanger: false
  });

  if (!confirmed) {
    // Cancel — revert the dropdown to the previous selection
    const prevSel = normalizeMarital(prevRaw);
    if (prevSel) {
      selectEl.value = prevSel;
    } else {
      selectEl.selectedIndex = 0; // back to the placeholder ("keep" / "not set")
    }
    return;
  }

  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;
  d.maritalStatus = newVal;
  saveToStorage();
  populateMaritalStatusFilter(); // keep the Marital Status filter options live
  renderDevoteesTable();
  logActivity('edit', 'Devotee', `Updated Marital Status for "${d.spiritualName || d.legalName}" to ${newVal}.`, d.id);
  syncDevoteeRecordToCloud(d);
  showToast(`Marital Status updated to ${newVal}`, 'success');
}

async function editDevotee(id) {
  closeProfileModal();
  // Confirmation before entering edit mode — Cancel keeps the record untouched
  const confirmed = await showAppConfirm({
    title: 'Edit Confirmation',
    message: 'Are you sure you want to edit this record?',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    icon: '✏️'
  });
  if (!confirmed) return;
  openDevoteeModal(id);
}

// ---- Calling Feedback Yes/No Toggle helpers ----
function setCallingToggle(btn, value) {
  const wrap = btn.closest('.call-toggle');
  if (!wrap) return;
  const input = wrap.querySelector('input');
  if (input) input.value = value;
  syncCallingToggle(wrap, value);
}

function setCallingToggleValue(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  const wrap = input.closest('.call-toggle');
  if (wrap) syncCallingToggle(wrap, value);
}

function syncCallingToggle(wrap, value) {
  const yes = wrap.querySelector('.ct-yes');
  const no = wrap.querySelector('.ct-no');
  const yesActive = 'ct-yes px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none bg-emerald-500 text-white shadow-sm';
  const noActive = 'ct-no px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none bg-rose-500 text-white shadow-sm';
  const yesIdle = 'ct-yes px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none text-slate-500 hover:text-slate-800 hover:bg-white';
  const noIdle = 'ct-no px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none text-slate-500 hover:text-slate-800 hover:bg-white';
  if (value === 'Yes') {
    if (yes) yes.className = yesActive;
    if (no) no.className = noIdle;
  } else if (value === 'No') {
    if (yes) yes.className = yesIdle;
    if (no) no.className = noActive;
  } else {
    if (yes) yes.className = yesIdle;
    if (no) no.className = noIdle;
  }
}

function syncAllCallingToggles() {
  document.querySelectorAll('.call-toggle').forEach(wrap => {
    const input = wrap.querySelector('input');
    syncCallingToggle(wrap, input ? input.value : '');
  });
}

// ---- Parcel & Tracking row toggle class presets (Pre Calling / Post Calling) ----
const TGL_YES_ACTIVE = 'ct-yes inline-flex items-center px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none bg-emerald-500 text-white shadow-sm';
const TGL_NO_ACTIVE = 'ct-no inline-flex items-center px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none bg-rose-500 text-white shadow-sm';
const TGL_IDLE_YES = 'ct-yes inline-flex items-center px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none text-slate-500 hover:text-slate-800 hover:bg-white';
const TGL_IDLE_NO = 'ct-no inline-flex items-center px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer select-none text-slate-500 hover:text-slate-800 hover:bg-white';

// ----------------------------------------------------
// ACTION CONFIRMATION MODAL CONTROLLER
// ----------------------------------------------------
let appConfirmResolve = null;

function showAppConfirm({ title = 'Confirmation', message = 'Are you sure you want to proceed?', confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false, icon = '⚠️' } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('action-confirm-modal');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    appConfirmResolve = resolve;

    const titleEl = document.getElementById('ac-modal-title');
    const msgEl = document.getElementById('ac-modal-message');
    const iconContainer = document.getElementById('ac-modal-icon-container');
    const cancelBtn = document.getElementById('ac-modal-cancel-btn');
    const confirmBtn = document.getElementById('ac-modal-confirm-btn');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    if (iconContainer) {
      iconContainer.innerText = icon;
      iconContainer.className = isDanger 
        ? 'w-14 h-14 rounded-full mx-auto flex items-center justify-center text-3xl mb-3.5 bg-rose-50 text-rose-600 border border-rose-200 shadow-xs'
        : 'w-14 h-14 rounded-full mx-auto flex items-center justify-center text-3xl mb-3.5 bg-amber-50 text-amber-600 border border-amber-200 shadow-xs';
    }

    if (cancelBtn) cancelBtn.innerText = cancelText;
    if (confirmBtn) {
      confirmBtn.innerText = confirmText;
      confirmBtn.className = isDanger
        ? 'w-1/2 py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-md transition cursor-pointer bg-rose-600 hover:bg-rose-700 active:scale-95'
        : 'w-1/2 py-2.5 px-4 rounded-xl font-bold text-xs text-white shadow-md transition cursor-pointer bg-indigo-600 hover:bg-indigo-700 active:scale-95';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });
}

window.handleAppConfirm = function(confirmed) {
  const modal = document.getElementById('action-confirm-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  if (appConfirmResolve) {
    const fn = appConfirmResolve;
    appConfirmResolve = null;
    fn(Boolean(confirmed));
  }
};

// Global escape key handler to cancel confirmation dialog
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const confModal = document.getElementById('action-confirm-modal');
    if (confModal && !confModal.classList.contains('hidden')) {
      handleAppConfirm(false);
    }
  }
});

// Toggle Pre/Post Calling for a parcel row with user confirmation
async function toggleParcelCalling(parcelId, field, targetValue) {
  const p = (state.parcels || []).find(x => x.id === parcelId);
  if (!p) return;

  const current = p[field] || 'No';
  const next = targetValue || (current === 'Yes' ? 'No' : 'Yes');

  // If already at target value, do not prompt or change
  if (p[field] === next) return;

  const fieldLabel = (field === 'preCalling') ? 'Pre Calling' : 'Post Calling';

  const confirmed = await showAppConfirm({
    title: `${fieldLabel} Confirmation`,
    message: `Are you sure you want to change ${fieldLabel} to ${next}?`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    icon: next === 'Yes' ? '📞' : '⚠️',
    isDanger: next === 'No'
  });

  if (!confirmed) return;

  p[field] = next;
  const devo = state.devotees.find(x => x.id === p.devoteeId);
  if (devo) devo[field] = next;

  const cell = document.getElementById('parcel-cell-' + (field === 'postCalling' ? 'post-' : 'pre-') + parcelId);
  if (cell) {
    const yes = cell.querySelector('.ct-yes');
    const no = cell.querySelector('.ct-no');
    if (yes) yes.className = next === 'Yes' ? TGL_YES_ACTIVE : TGL_IDLE_YES;
    if (no) no.className = next === 'No' ? TGL_NO_ACTIVE : TGL_IDLE_NO;
    const hidden = cell.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = next;
  }

  saveToStorage();
  if (getSupabaseClient()) {
    syncParcelToSupabase(p);
  } else {
    console.warn('Supabase not available — calling status saved locally only.');
  }
  showToast(`${fieldLabel} updated to ${next}`, 'success');
}

// Save the Tracking Number entered inline: Mandatory (*), 13-14 numeric digits only
function saveParcelTracking(parcelId) {
  const p = (state.parcels || []).find(x => x.id === parcelId);
  if (!p) return;
  const input = document.getElementById('pt-trk-' + parcelId);
  const raw = input ? input.value.trim() : '';
  const clean = raw.replace(/\D/g, '');

  if (input) {
    input.value = clean.slice(0, 14);
  }

  // 1. Mandatory (*)
  if (!clean) {
    showToast('Tracking Number is mandatory (*) — please enter the 13-14 digit number', 'error');
    if (input) input.focus();
    return;
  }

  // 2. 13-14 digits (12 or fewer digits -> cannot save)
  if (!/^\d{13,14}$/.test(clean)) {
    showToast(`Tracking Number must be 13-14 digits (currently ${clean.length} digits entered)`, 'error');
    if (input) input.focus();
    return;
  }

  const finalTrk = clean.slice(0, 14);
  p.courierTrackingNo = finalTrk;
  const devo = state.devotees.find(x => x.id === p.devoteeId);
  if (devo) devo.courierTrackingNo = finalTrk;

  saveToStorage();
  renderParcelsTable();
  showToast(`Tracking Number saved: ${finalTrk}`, 'success');

  if (getSupabaseClient()) {
    syncParcelToSupabase(p);
  } else {
    console.warn('Supabase not available — tracking number saved locally only.');
  }
}

async function deleteDevotee(id) {
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;
  const name = d.spiritualName || d.legalName;

  // 🛡️ ROLE-BASED ACCESS CONTROL:
  // Non-Super Admins CANNOT delete directly — open Delete Request Modal for Super Admin approval!
  if (!isSuperAdmin()) {
    if (isViewer()) {
      showToast('⛔ Viewers cannot delete or request deletion of devotee records.', 'error');
      return;
    }
    openDeleteRequestModal({
      id: id,
      type: 'DEVOTEE',
      title: `${name} (Sl No: ${d.slNo || d.id})`
    });
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Delete Devotee Record (Super Admin)',
    message: `Are you sure you want to permanently remove ${name} from the devotee database? This cannot be undone.`,
    confirmText: 'Delete Permanently',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗑️'
  });
  if (!confirmed) return;

  // 1. Mark devotee and their parcels in tombstone set so they can NEVER resurrect
  markDevoteesAsDeleted(id);
  const devoteeParcelIds = (state.parcels || [])
    .filter(p => p.devoteeId === id)
    .map(p => p.id);
  if (devoteeParcelIds.length > 0) {
    markParcelsAsDeleted(devoteeParcelIds);
  }

  // 2. Remove from local memory & storage
  state.devotees = state.devotees.filter(x => x.id !== id);
  state.parcels = (state.parcels || []).filter(p => p.devoteeId !== id);
  if (state.selectedDevotees) state.selectedDevotees.delete(id);
  if (state.selectedCelebrations) state.selectedCelebrations.delete(id);
  if (state.selectedParcels) {
    devoteeParcelIds.forEach(pid => state.selectedParcels.delete(pid));
  }
  saveToStorage();
  try {
    localStorage.setItem(STORAGE_KEYS.DEVOTEES, JSON.stringify(state.devotees));
    localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels));
  } catch (e) {}

  recordAuditEvent({
    action: 'delete',
    module: 'devotees',
    recordId: id,
    summary: `Permanently deleted devotee "${name}".`,
    result: 'SUCCESS',
    oldValues: { ...d }
  });
  updateDevoteeAutocompleteList();
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  initCharts();

  // 3. Delete from Supabase Cloud (Devotee record + related parcels)
  try {
    const client = getSupabaseClient();
    if (client) {
      const { error: dErr } = await client.from('devotees').delete().eq('DEVOTEE ID', id);
      if (dErr) console.warn('Supabase devotee delete warning:', dErr.message);
      if (devoteeParcelIds.length > 0) {
        await client.from('parcels').delete().eq('devotee_id', id);
      }
      console.log('✅ Devotee and related parcels deleted from Supabase Cloud:', id);
    }
  } catch (e) {
    console.warn('Cloud devotee delete error:', e);
  }

  showToast(`Devotee ${name} removed successfully`, 'success');
}

async function deleteAllBirthdayAnniversaryRecords() {
  if (!isSuperAdmin()) {
    showToast('⛔ Bulk deletion is restricted to Super Admin only.', 'error');
    return;
  }
  // Collect every devotee that appears in the Birthday & Anniversary table
  const idsInTable = new Set();
  state.devotees.forEach(d => {
    const bdayStr = d.birthdayRaw || d.birthday || d.dob;
    const annivStr = d.anniversaryRaw || d.anniversary || d.anniversaryDate;
    const hasBday = !!bdayStr;
    const hasAnniv = !!(annivStr && annivStr !== 'None' && annivStr !== 'N/A');
    if (hasBday || hasAnniv) {
      idsInTable.add(d.id);
    }
  });

  const count = idsInTable.size;
  if (count === 0) {
    showToast('No birthday or anniversary records found to delete', 'info');
    return;
  }

  const ok = confirm(
    `⚠️ WARNING: You are about to DELETE ALL ${count} records from the Devotee Birthday & Anniversary table.\n\n` +
    `This will permanently remove every devotee record that has an Appearance Day (birthday) or Vivaha Anniversary. This action CANNOT be undone.\n\n` +
    `Are you sure you want to continue?`
  );
  if (!ok) return;

  const idsArr = Array.from(idsInTable);
  markDevoteesAsDeleted(idsArr);

  state.devotees = state.devotees.filter(d => !idsInTable.has(d.id));

  if (state.selectedDevotees) state.selectedDevotees.clear();
  if (state.selectedParcels) state.selectedParcels.clear();

  saveToStorage();
  try {
    localStorage.setItem(STORAGE_KEYS.DEVOTEES, JSON.stringify(state.devotees));
  } catch (e) {}

  updateDevoteeAutocompleteList();
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  initCharts();

  // Delete from Supabase in chunks of 50
  try {
    const client = getSupabaseClient();
    if (client) {
      for (let i = 0; i < idsArr.length; i += 50) {
        const chunk = idsArr.slice(i, i + 50);
        await client.from('devotees').delete().in('DEVOTEE ID', chunk);
      }
      console.log(`✅ Permanently deleted ${idsArr.length} devotees from Supabase Cloud.`);
    }
  } catch (e) {
    console.warn('Supabase bulk devotee delete warning:', e);
  }

  showToast(`Deleted ${count} birthday/anniversary record${count > 1 ? 's' : ''}`, 'success');
}

// ----------------------------------------------------
// VIEW DEVOTEE PROFILE MODAL
// ----------------------------------------------------
// Address Verification — single source of truth = Devotee Directory record.
// Used by View Profile, Birthday/Anniversary list, Parcel & Tracking (shipping label).
// The rule itself never changes per-section, so no section can show a stale state.
function isDevoteAddressVerified(dev) {
  if (!dev) return false;
  // Explicit only — never infer "Verified" from the address text/length.
  return dev.addressVerified === 'Verified';
}

function viewDevoteeProfile(id) {
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;

  const displayName = d.spiritualName || d.legalName;
  document.getElementById('vp-spiritual-name').innerText = displayName;
  document.getElementById('vp-legal-name').innerText = d.spiritualName ? `Legal Name: ${d.legalName}` : 'Congregation Member';
  const avatarEl = document.getElementById('vp-avatar');
  if (avatarEl) {
    const photoUrl = getDirectPhotoUrl(d.photo || d.photoDirect || d.cloudinaryPhoto, d);
    if (photoUrl) {
      const driveId = extractGoogleDriveFileId(d.photo || d.photoDirect || photoUrl);
      const fallbackUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w200` : (d.cloudinaryPhoto || '');
      avatarEl.className = 'w-14 h-14 rounded-full border-2 border-white/60 shadow-md overflow-hidden flex items-center justify-center flex-shrink-0';
      avatarEl.innerHTML = `<img src="${photoUrl}" alt="${escapeHtml(displayName)}" referrerpolicy="no-referrer" class="w-full h-full object-cover rounded-full" data-fallback="${fallbackUrl}" onerror="handleAvatarError(this, '${escapeHtml(displayName)}', '${d.gender || 'Male'}')">`;
    } else {
      const isFemale = (d.gender || '').toLowerCase() === 'female';
      const initials = getDevoteeInitials(displayName);
      avatarEl.className = `w-14 h-14 rounded-full ${isFemale ? 'bg-gradient-to-tr from-rose-500 to-purple-600' : 'bg-gradient-to-tr from-teal-600 to-indigo-600'} border-2 border-white/60 flex items-center justify-center text-lg font-bold text-white shadow-md select-none tracking-wider overflow-hidden`;
      avatarEl.innerHTML = `<span>${initials}</span>`;
    }
  }

  const idEl = document.getElementById('vp-id');
  if (idEl) idEl.innerText = d.id || 'N/A';
  const bloodEl = document.getElementById('vp-blood');
  if (bloodEl) bloodEl.innerText = d.bloodGroup || 'Not Tested';
  const ageEl = document.getElementById('vp-age');
  if (ageEl) ageEl.innerText = `${calculateAge(d.dob)} yrs (${formatDate(d.dob)})`;
  const initEl = document.getElementById('vp-initiation-level');
  if (initEl) initEl.innerText = d.initiationStatus || 'Aspirant';
  const cityEl = document.getElementById('vp-city');
  if (cityEl) cityEl.innerText = d.city || 'N/A';

  const phoneEl = document.getElementById('vp-phone');
  if (phoneEl) phoneEl.innerText = d.phone || 'N/A';
  const waEl = document.getElementById('vp-whatsapp');
  if (waEl) waEl.innerText = d.whatsapp || d.phone || 'N/A';
  const emailEl = document.getElementById('vp-email');
  if (emailEl) emailEl.innerText = d.email || 'N/A';
  const addrEl = document.getElementById('vp-address');
  if (addrEl) addrEl.innerText = (d.address ? d.address : 'No address recorded') + (d.pincode ? ' - ' + d.pincode : '');
  const addrVerifyEl = document.getElementById('vp-address-verify');
  if (addrVerifyEl) {
    if (isDevoteAddressVerified(d)) {
      addrVerifyEl.innerHTML = '<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><span>🟢</span><span>Verified</span></span>';
    } else if (d.addressVerified) {
      addrVerifyEl.innerHTML = '<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300"><span>🔴</span><span>Unverified</span></span>';
    } else {
      addrVerifyEl.innerHTML = '<span class="text-slate-400 text-xs italic">—</span>';
    }
  }
  const emergEl = document.getElementById('vp-emergency');
  if (emergEl) emergEl.innerText = `${d.emergencyName || 'None'} (${d.emergencyPhone || 'N/A'})`;

  const guruEl = document.getElementById('vp-guru');
  if (guruEl) guruEl.innerText = d.guru || 'None / In Training';
  const diksaEl = document.getElementById('vp-diksa-date');
  if (diksaEl) diksaEl.innerText = d.initiationDate ? formatDate(d.initiationDate) : 'Not initiated';
  const brahmanaEl = document.getElementById('vp-brahmana-date');
  if (brahmanaEl) brahmanaEl.innerText = d.brahmanaDate ? formatDate(d.brahmanaDate) : 'N/A';
  const sevaEl = document.getElementById('vp-seva');
  if (sevaEl) sevaEl.innerText = d.currentSeva || 'General congregation seva';
  const degEl = document.getElementById('vp-degrees');
  if (degEl) degEl.innerText = (d.degrees && d.degrees.length > 0) ? d.degrees.join(', ') : 'None yet';

  const condEl = document.getElementById('vp-conditions');
  if (condEl) condEl.innerText = d.medicalConditions || 'No chronic health issues reported.';
  const medEl = document.getElementById('vp-medications');
  if (medEl) medEl.innerText = d.medications || 'None / General prasadam diet.';
  const notesEl = document.getElementById('vp-notes');
  if (notesEl) notesEl.innerText = `Insurance: ${d.insurance || 'None'}. Notes: ${d.notes || 'None'}`;

  // Parcel Tracking + Calling Feedback — same values as the Parcel & Tracking tab (linked master record)
  const trkEl = document.getElementById('vp-tracking-no');
  if (trkEl) {
    if (d.courierTrackingNo) {
      const trackUrl = getCourierTrackingUrl(d.courierPartner, d.courierTrackingNo);
      trkEl.innerHTML = `<a href="${trackUrl}" target="_blank" rel="noopener" class="text-sky-700 underline decoration-dotted hover:text-sky-900" title="Open carrier tracking page">${escapeHtml(d.courierTrackingNo)}</a>`;
    } else {
      trkEl.innerText = 'Not linked';
    }
  }
  const preEl = document.getElementById('vp-pre-calling');
  if (preEl) preEl.innerText = d.preCalling || '—';
  const postEl = document.getElementById('vp-post-calling');
  if (postEl) postEl.innerText = d.postCalling || '—';

  // Direct action buttons
  const waBtn = document.getElementById('vp-whatsapp-btn');
  waBtn.onclick = () => openWishesModal(d.id);

  const callBtn = document.getElementById('vp-call-btn');
  callBtn.onclick = () => {
    if (d.phone) window.open(`tel:${d.phone.replace(/\s+/g, '')}`);
    else alert('Phone number not available');
  };

  const editBtn = document.getElementById('vp-edit-btn');
  editBtn.onclick = () => editDevotee(d.id);

  // Quick address actions — edits the Directory record (single source of truth)
  const upAddrBtn = document.getElementById('vp-update-address-btn');
  if (upAddrBtn) upAddrBtn.onclick = () => openEditAddressModal(d.id);
  const verAddrBtn = document.getElementById('vp-verify-address-btn');
  if (verAddrBtn) verAddrBtn.onclick = () => openVerifyAddressModal(d.id);

  document.getElementById('view-profile-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeProfileModal() {
  document.getElementById('view-profile-modal').classList.add('hidden');
}

function printDevoteeProfile() {
  window.print();
}

// ----------------------------------------------------
// BIRTHDAY & VAISHNAVA ANNIVERSARY CELEBRATIONS
// ----------------------------------------------------
state.selectedCelebrationMonth = 'ALL'; // Default: All Months (full-year view)
state.selectedCelebrationDate = null; // Date View — exact-date filter (overrides month)
state.selectedCelebrationCity = null; // City Filter — searchable (every city name from the database)
state.selectedCelebrationMode = 'ALL'; // Mode of Delivery Filter (Delhivery Courier / Self Mode)
state.selectedCelebrationMarital = 'ALL'; // Marital Status Filter (options populate live from the database)

// Friendly display map for Marital Status (used by the filter dropdown & the table badge)
const MARITAL_DISPLAY = {
  'Married': { icon: '💞', label: 'Married' },
  'Grihastha': { icon: '🏡', label: 'Grihastha' },
  'Widow': { icon: '🤍', label: 'Widow' },
  'Single': { icon: '🕊️', label: 'Single' },
  'Unmarried': { icon: '🕊️', label: 'Unmarried' },
  'Brahmachari': { icon: '🕉️', label: 'Brahmachari' }
};
state.celebrationViewMode = 'cards';
state.activeTrackingDevotee = null;
state.activeGreetingDevotee = null;

function setCelebrationEventType(type) {
  state.celebrationEventType = type;
  document.querySelectorAll('.event-type-btn').forEach(btn => {
    if (btn.getAttribute('data-type') === type) {
      btn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md transition event-type-btn bg-white shadow-sm text-pink-700';
    } else {
      btn.className = 'px-2.5 py-1 text-xs font-medium rounded-md transition event-type-btn text-slate-600 hover:text-slate-900';
    }
  });
  renderBirthdaysGrid();
}

function setBdayTimeframe(tf) {
  state.bdayTimeframe = tf;
  document.querySelectorAll('.bday-btn').forEach(btn => {
    if (btn.getAttribute('data-tf') === tf) {
      btn.className = 'px-2.5 py-1 text-xs font-semibold rounded-md transition bday-btn bg-white shadow-sm text-pink-700';
    } else {
      btn.className = 'px-2.5 py-1 text-xs font-medium rounded-md transition bday-btn text-slate-600 hover:text-slate-900';
    }
  });
  renderBirthdaysGrid();
}

function handleCelebrationMonthChange() {
  const select = document.getElementById('bday-select-month');
  if (select) {
    state.selectedCelebrationMonth = select.value;
  }
  renderBirthdaysGrid();
}

// Mode of Delivery Filter — Delhivery Courier / Self Mode (matches the per-row select)
function handleCelebrationModeChange() {
  const select = document.getElementById('bday-filter-mode');
  if (select) state.selectedCelebrationMode = select.value;
  renderBirthdaysGrid();
}

// Marital Status Filter — show only devotees/couples with the chosen status
function handleCelebrationMaritalChange() {
  const select = document.getElementById('bday-filter-marital');
  if (select) state.selectedCelebrationMarital = select.value;
  renderBirthdaysGrid();
}

// All marital statuses present in the devotee database (used by the Marital Status filter)
function getAllMaritalStatuses() {
  const set = new Set();
  (state.devotees || []).forEach(d => {
    if (d.maritalStatus && String(d.maritalStatus).trim()) set.add(String(d.maritalStatus).trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Populate the Marital Status filter dropdown — always reflects the live database
function populateMaritalStatusFilter() {
  const select = document.getElementById('bday-filter-marital');
  if (!select) return;
  const current = select.value || 'ALL';
  const statuses = getAllMaritalStatuses();
  select.innerHTML = '<option value="ALL" selected>All Statuses</option>' +
    statuses.map(s => {
      const m = MARITAL_DISPLAY[s] || { icon: '◆', label: s };
      return `<option value="${escapeHtml(s)}">${m.icon} ${escapeHtml(m.label)}</option>`;
    }).join('');
  select.value = statuses.includes(current) ? current : 'ALL';
}

// Date View — exact-date filter (shows every Birthday & Anniversary on that day)
function handleCelebrationDateChange() {
  const dateEl = document.getElementById('bday-select-date');
  state.selectedCelebrationDate = (dateEl && dateEl.value) ? dateEl.value : null;
  const clearBtn = document.getElementById('bday-date-clear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !state.selectedCelebrationDate);
  updateCelebrationDateColumnHeader();
  renderBirthdaysGrid();
}

function clearCelebrationDate() {
  const dateEl = document.getElementById('bday-select-date');
  if (dateEl) dateEl.value = '';
  state.selectedCelebrationDate = null;
  const clearBtn = document.getElementById('bday-date-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  updateCelebrationDateColumnHeader();
  renderBirthdaysGrid();
}

// All city names present in the devotee database (used by the City filter)
function getAllCities() {
  const set = new Set();
  (state.devotees || []).forEach(d => {
    if (d.city && String(d.city).trim()) set.add(String(d.city).trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// City Filter — searchable dropdown listing every city in the database
function handleCelebrationCitySearch(query) {
  const drop = document.getElementById('bday-city-dropdown');
  if (!drop) return;
  const q = (query || '').trim().toLowerCase();
  const cities = getAllCities().filter(c => !q || c.toLowerCase().includes(q)).slice(0, 60);
  if (!cities.length) {
    drop.innerHTML = '';
    drop.classList.add('hidden');
    return;
  }
  drop.innerHTML = cities
    .map(c => `<button type="button" data-city="${escapeHtml(c)}" onclick="selectCelebrationCity(this.getAttribute('data-city'))" class="block w-full text-left px-3 py-1.5 hover:bg-pink-50 text-slate-700 font-medium truncate cursor-pointer">${escapeHtml(c)}</button>`)
    .join('');
  drop.classList.remove('hidden');
}

function selectCelebrationCity(cityName) {
  const input = document.getElementById('bday-city-search');
  const clearBtn = document.getElementById('bday-city-clear');
  const drop = document.getElementById('bday-city-dropdown');
  if (input) input.value = cityName;
  if (clearBtn) clearBtn.classList.remove('hidden');
  if (drop) drop.classList.add('hidden');
  state.selectedCelebrationCity = cityName;
  renderBirthdaysGrid();
}

function clearCelebrationCity() {
  const input = document.getElementById('bday-city-search');
  const clearBtn = document.getElementById('bday-city-clear');
  const drop = document.getElementById('bday-city-dropdown');
  if (input) input.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  if (drop) drop.classList.add('hidden');
  state.selectedCelebrationCity = null;
  renderBirthdaysGrid();
}

// Clear EVERY filter in the Birthday / Anniversary toolbar (Month / Date / City / Mode / Search)
function clearCelebrationFilters() {
  state.selectedCelebrationMonth = 'ALL'; // Clear resets to All Months (full-year view)
  const monthEl = document.getElementById('bday-select-month');
  if (monthEl) monthEl.value = state.selectedCelebrationMonth;
  clearCelebrationDate();
  clearCelebrationCity();
  const modeEl = document.getElementById('bday-filter-mode');
  if (modeEl) modeEl.value = 'ALL';
  state.selectedCelebrationMode = 'ALL';
  const maritalEl = document.getElementById('bday-filter-marital');
  if (maritalEl) maritalEl.value = 'ALL';
  state.selectedCelebrationMarital = 'ALL';
  const searchEl = document.getElementById('bday-search-input');
  if (searchEl) searchEl.value = '';
  renderBirthdaysGrid();
  showToast('All celebration filters cleared', 'info');
}

function onCelebrationCityBlur() {
  setTimeout(() => {
    const drop = document.getElementById('bday-city-dropdown');
    if (drop) drop.classList.add('hidden');
  }, 150);
}

function onCelebrationCityKeydown(ev) {
  if (ev.key === 'Escape') {
    const drop = document.getElementById('bday-city-dropdown');
    if (drop) drop.classList.add('hidden');
  } else if (ev.key === 'Enter') {
    const first = document.querySelector('#bday-city-dropdown button');
    if (first) { ev.preventDefault(); first.click(); }
  }
}

// Date column header: exact-date view shows both types (+Date), otherwise per-tab (Birthday / Anniversary)
function updateCelebrationDateColumnHeader() {
  const el = document.getElementById('bday-date-col-title');
  if (el) {
    if (state.selectedCelebrationDate) {
      el.innerText = '📅 Date';
    } else {
      el.innerText = (state.currentTab === 'anniversaries') ? '💍 Anniversary' : '🎂 Birthday';
    }
  }
}

// All Birthday / Appearance Day celebration entries (UNFILTERED — includes soft-removed ones)
function getAllBirthdayCelebrations() {
  const bdays = [];
  state.devotees.forEach(d => {
    const bdayStr = d.birthdayRaw || d.birthday || d.dob;
    if (bdayStr) {
      const timing = checkEventTiming(d.dob || bdayStr);
      let bMo = d.birthMonth || d.bMonth;
      let bDy = d.birthDay || d.bDay;
      if (!bMo && timing.parts) { bMo = timing.parts.month + 1; bDy = timing.parts.day; }
      const years = calculateYearsPassed(d.dob || bdayStr) + (timing.isToday ? 0 : 1);

      bdays.push({
        id: d.id,
        devotee: d,
        spouseDevotee: null,
        isCouple: false,
        coupleIds: [d.id],
        coupleTitle: d.spiritualName || d.legalName,
        eventType: 'BIRTHDAY',
        label: 'Appearance Day',
        icon: 'cake',
        badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
        accentColor: 'border-pink-300',
        date: d.dob || bdayStr,
        rawDateStr: d.birthdayRaw || d.birthday || formatDate(d.dob),
        month: bMo || (timing.parts ? timing.parts.month + 1 : 4),
        day: bDy || (timing.parts ? timing.parts.day : 1),
        years: years,
        milestone: years > 0 ? `Turning ${years} Years` : 'Appearance Day',
        timing: timing
      });
    }
  });
  return bdays;
}

function getAllCelebrations() {
  const celebrations = [];

  // 1. Birthday / Appearance Day (Individual) — soft-removed birthdays are hidden from the list
  getAllBirthdayCelebrations().forEach(it => { if (!isBdayEntryRemoved(it)) celebrations.push(it); });

  // 2. Marriage Anniversary (Merged Couples: Husband + Wife = 1 Entry & 1 Count)
  const annivList = getMergedAnniversaryCelebrations(state.devotees);
  annivList.forEach(it => { if (!isAnnivEntryRemoved(it)) celebrations.push(it); });

  return celebrations;
}

// A devotee/couple "removed" from the Anniversary list is moved to the Removed section —
// the record is never deleted and can be restored (Accept) anytime.
function isAnnivEntryRemoved(item) {
  const removed = state.anniversaryRemovedIds || [];
  if (!removed.length) return false;
  return (item.coupleIds || [item.id]).some(id => removed.includes(id));
}

// A devotee "removed" from the Birthday list is moved to the Removed section —
// the record is never deleted and can be restored (Accept) anytime.
function isBdayEntryRemoved(item) {
  const removed = state.birthdayRemovedIds || [];
  if (!removed.length) return false;
  return (item.coupleIds || [item.id]).some(id => removed.includes(id));
}

// Small status badge shown in the celebration table's "Marital Status" column
function getMaritalStatusBadgeHtml(status) {
  const s = (status || '').trim();
  if (!s) return '';
  const meta = {
    'Married': { icon: '💞', cls: 'bg-pink-50 text-pink-700 border-pink-200' },
    'Grihastha': { icon: '🏡', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    'Widow': { icon: '🤍', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    'Single': { icon: '🕊️', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    'Unmarried': { icon: '🕊️', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    'Brahmachari': { icon: '🕉️', cls: 'bg-violet-50 text-violet-700 border-violet-200' }
  };
  const m = meta[s] || { icon: '◆', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  return `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls} shadow-xs cursor-default" title="Marital Status: ${escapeHtml(s)}">` +
    `<span>${m.icon}</span><span>${escapeHtml(s)}</span></span>`;
}

function renderBirthdaysGrid() {
  const container = document.getElementById('bday-cards-grid');
  const tableBody = document.getElementById('bday-table-body');
  const emptyState = document.getElementById('bday-empty-state');
  if (!tableBody) return;

  const isAnnivTab = (state.currentTab === 'anniversaries');
  updateCelebrationDateColumnHeader();

  const tf = state.bdayTimeframe;
  const eventType = state.celebrationEventType;
  const selectedMonth = state.selectedCelebrationMonth || '4';
  const search = document.getElementById('bday-search-input') ? document.getElementById('bday-search-input').value.toLowerCase().trim() : '';
  // Date View — exact-date filter (takes precedence over the Month View)
  const selDate = state.selectedCelebrationDate || '';
  const dateParts = /^\d{4}-\d{2}-\d{2}$/.test(selDate) ? parseDateParts(selDate) : null;

  const allCelebrations = getAllCelebrations();

  // Filter items
  const filtered = allCelebrations.filter(item => {
    const d = item.devotee;

    // 1. Event Type Filter — Date View shows BOTH types on the chosen day; otherwise the tab's type applies
    if (!dateParts && eventType !== 'ALL' && item.eventType !== eventType) return false;

    // 2. Date / Month Filter — exact date wins over the month selector
    if (dateParts) {
      if (item.month !== (dateParts.month + 1) || item.day !== dateParts.day) return false;
    } else if (selectedMonth !== 'ALL') {
      const targetM = parseInt(selectedMonth);
      if (item.month !== targetM) return false;
    }

    // 3. Timeframe Filter (not applied in the exact-date view)
    if (!dateParts) {
      const timing = item.timing;
      if (tf === 'today' && !timing.isToday) return false;
      if (tf === 'tomorrow' && !timing.isTomorrow) return false;
      if (tf === 'week' && !timing.isThisWeek) return false;
      if (tf === 'month' && !timing.isThisMonth && selectedMonth === 'ALL') return false;
    }

    // 4. Keyword search filter (supports Husband, Wife, Phones, IDs)
    if (search) {
      const matchDev = (dev) => {
        if (!dev) return false;
        const sName = (dev.spiritualName || '').toLowerCase();
        const lName = (dev.legalName || '').toLowerCase();
        const phone = (dev.phone || '').toLowerCase();
        const city = (dev.city || '').toLowerCase();
        const pin = (dev.pincode || '').toLowerCase();
        const devId = (dev.id || '').toLowerCase();
        return sName.includes(search) || lName.includes(search) || phone.includes(search) || city.includes(search) || pin.includes(search) || devId.includes(search);
      };
      const m1 = matchDev(d);
      const m2 = item.spouseDevotee ? matchDev(item.spouseDevotee) : false;
      if (!m1 && !m2) return false;
    }

    // 5. City filter — exact match on either spouse's city (all city names come from the database)
    const cityFilter = (state.selectedCelebrationCity || '').toLowerCase().trim();
    if (cityFilter) {
      const c1 = (d.city || '').toLowerCase() === cityFilter;
      const c2 = item.spouseDevotee ? (item.spouseDevotee.city || '').toLowerCase() === cityFilter : false;
      if (!c1 && !c2) return false;
    }

    // 6. Mode of Delivery filter — matches the per-row Delivery select exactly
    //    (Self Mode when the devotee's deliveryMode is SELF, otherwise Delhivery Courier)
    const modeFilter = state.selectedCelebrationMode || 'ALL';
    if (modeFilter !== 'ALL') {
      if (deriveDeliveryModeLabel(d) !== modeFilter) return false;
    }

    // 7. Marital Status filter — a couple matches when EITHER spouse has the chosen status
    const maritalFilter = state.selectedCelebrationMarital || 'ALL';
    if (maritalFilter !== 'ALL') {
      const statuses = [d.maritalStatus, item.spouseDevotee ? item.spouseDevotee.maritalStatus : null]
        .map(s => (s || '').trim());
      if (!statuses.includes(maritalFilter)) return false;
    }

    return true;
  }).sort((a, b) => {
    if (a.timing.daysRemaining !== null && b.timing.daysRemaining !== null) {
      return a.timing.daysRemaining - b.timing.daysRemaining;
    }
    return a.day - b.day;
  });

  // Update Celebration Strip KPIs
  let countBdays = 0, countMarr = 0, countTodayTom = 0, countPacked = 0, countTransit = 0, countDelivered = 0;
  filtered.forEach(it => {
    if (it.eventType === 'BIRTHDAY') countBdays++;
    if (it.eventType === 'MARRIAGE') countMarr++;
    if (it.timing.isToday || it.timing.isTomorrow) countTodayTom++;
    const pRec = (state.parcels || []).find(p => p.devoteeId === it.devotee.id || (it.spouseDevotee && p.devoteeId === it.spouseDevotee.id));
    const ps = pRec ? (pRec.parcelStatus || '') : '';
    if (ps === 'PACKED_BLESSED') countPacked++;
    else if (ps === 'IN_TRANSIT' || ps === 'OUT_FOR_DELIVERY') countTransit++;
    else if (ps === 'DELIVERED') countDelivered++;
  });

  const bStatBday = document.getElementById('bday-stat-birthdays');
  if (bStatBday) bStatBday.innerText = countBdays;
  const bStatAnniv = document.getElementById('bday-stat-anniv');
  if (bStatAnniv) bStatAnniv.innerText = countMarr;
  const bStatToday = document.getElementById('bday-stat-today-tom');
  if (bStatToday) bStatToday.innerText = countTodayTom;
  const bStatPack = document.getElementById('bday-stat-packed');
  if (bStatPack) bStatPack.innerText = countPacked;
  const bStatTrans = document.getElementById('bday-stat-transit');
  if (bStatTrans) bStatTrans.innerText = countTransit;
  const bStatDeliv = document.getElementById('bday-stat-delivered');
  if (bStatDeliv) bStatDeliv.innerText = countDelivered;

  if (filtered.length === 0) {
    if (container) container.innerHTML = '';
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-12 text-slate-400">
          <div class="flex flex-col items-center space-y-1.5">
            <span class="text-2xl">🎂</span>
            <span class="font-bold text-sm text-slate-700">No celebrations found for selected filters</span>
            <span class="text-xs text-slate-400">Try the Month View (pick a month), the Date View (pick an exact date), or clear your search.</span>
          </div>
        </td>
      </tr>
    `;
    if (emptyState) emptyState.classList.add('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  // Render Table View: Select ☑ | S.No. | Name | Date | Phone | City | Mode of Delivery | Actions
  tableBody.innerHTML = filtered.map((item, idx) => {
    const d = item.devotee;
    const isCouple = !!item.isCouple;
    const spouseDevotee = item.spouseDevotee;
    const displayName = d.spiritualName || d.legalName;
    const bdayDateText = item.rawDateStr || formatDate(item.date);
    const eventIcon = item.eventType === 'MARRIAGE' ? '💍' : '🎂';
    const serialNo = idx + 1;
    const isSel = state.selectedCelebrations.has(d.id) || (spouseDevotee && state.selectedCelebrations.has(spouseDevotee.id));
    const liveParcel = (state.parcels || []).find(p => p.devoteeId === d.id || (spouseDevotee && p.devoteeId === spouseDevotee.id));
    const hasParcel = !!liveParcel;
    const parcelType = item.eventType === 'MARRIAGE' ? 'Anniversary' : 'Birthday';

    return `
      <tr class="hover:bg-slate-50/90 transition border-b border-slate-100 ${isSel ? 'bg-pink-50/40' : ''}">
        <!-- 0. Select -->
        <td class="py-2 px-2 text-center">
          <input type="checkbox" data-id="${d.id}" onchange="toggleCelebrationSelection('${d.id}', this.checked, this)" ${isSel ? 'checked' : ''} class="celebration-row-checkbox w-4 h-4 rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer" title="Select for bulk actions">
        </td>
        <!-- 1. S.No. -->
        <td class="py-2 px-2 text-center">
          <span class="font-bold text-slate-500">${serialNo}</span>
        </td>
        <!-- 2. Name -->
        <td class="py-2.5 px-4 min-w-[260px]">
          ${isCouple && spouseDevotee ? `
            <div class="flex items-start space-x-3">
              <div class="relative flex items-center shrink-0 mt-0.5">
                <div class="p-[2px] border border-emerald-400 rounded-sm bg-white relative z-10 shadow-xs cursor-pointer" 
                     onclick="handleDevoteeAvatarClick(event, '${d.id}')" 
                     ondblclick="handleDevoteeAvatarDblClick(event, '${d.id}')" 
                     title="${escapeHtml(d.spiritualName || d.legalName)} (Double-click to enlarge photo)">
                  ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
                </div>
                <div class="p-[2px] border border-purple-300 rounded-sm bg-white relative -ml-2.5 z-0 shadow-xs cursor-pointer" 
                     onclick="handleDevoteeAvatarClick(event, '${spouseDevotee.id}')" 
                     ondblclick="handleDevoteeAvatarDblClick(event, '${spouseDevotee.id}')" 
                     title="${escapeHtml(spouseDevotee.spiritualName || spouseDevotee.legalName)} (Double-click to enlarge photo)">
                  ${getDevoteeAvatarHtml(spouseDevotee, 'w-8 h-8', 'text-[10px]')}
                </div>
              </div>
              <div class="min-w-0 flex-1">
                ${isAnnivTab ? `
                <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')" title="View ${escapeHtml(d.legalName || d.spiritualName || '')} profile">
                  <span>${escapeHtml(d.legalName || d.spiritualName || 'N/A')}</span>
                </div>
                <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition mt-1.5" onclick="viewDevoteeProfile('${spouseDevotee.id}')" title="View ${escapeHtml(spouseDevotee.legalName || spouseDevotee.spiritualName || '')} profile">
                  <span>${escapeHtml(spouseDevotee.legalName || spouseDevotee.spiritualName || 'N/A')}</span>
                </div>
                ` : `
                <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')" title="View ${escapeHtml(d.spiritualName || d.legalName)} profile">
                  <span>${escapeHtml(d.spiritualName || d.legalName)}</span>
                </div>
                <div class="text-[12px] text-slate-400 leading-tight mt-0.5">
                  Legal Name: ${escapeHtml(d.legalName || 'N/A')}
                </div>
                <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition mt-1.5" onclick="viewDevoteeProfile('${spouseDevotee.id}')" title="View ${escapeHtml(spouseDevotee.spiritualName || spouseDevotee.legalName)} profile">
                  <span>${escapeHtml(spouseDevotee.spiritualName || spouseDevotee.legalName)}</span>
                </div>
                <div class="text-[12px] text-slate-400 leading-tight mt-0.5">
                  Legal Name: ${escapeHtml(spouseDevotee.legalName || 'N/A')}
                </div>
                `}
              </div>
            </div>
          ` : `
            <div class="flex items-start space-x-3">
              <div class="p-[2px] border border-slate-200 rounded-sm bg-white shrink-0 mt-0.5 shadow-xs cursor-pointer" 
                   onclick="handleDevoteeAvatarClick(event, '${d.id}')" 
                   ondblclick="handleDevoteeAvatarDblClick(event, '${d.id}')" 
                   title="${escapeHtml(displayName)} (Double-click to enlarge photo)">
                ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
              </div>
              <div class="min-w-0 flex-1">
                ${isAnnivTab ? `
                <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')">
                  <span>${escapeHtml(d.legalName || d.spiritualName || 'N/A')}</span>
                  ${item.spouse ? `<span class="text-slate-500 font-normal text-xs ml-1">❤️ ${item.spouse}</span>` : ''}
                </div>
                ` : `
                <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')">
                  <span>${displayName}</span>
                  ${item.spouse ? `<span class="text-slate-500 font-normal text-xs ml-1">❤️ ${item.spouse}</span>` : ''}
                </div>
                ${d.legalName && d.legalName !== displayName ? `
                  <div class="text-[12px] text-slate-400 leading-tight mt-0.5">
                    Legal Name: ${escapeHtml(d.legalName)}
                  </div>
                ` : ''}
                `}
              </div>
            </div>
          `}
        </td>

        <!-- 2. Birthday / Anniversary Date -->
        <td class="py-2 px-1.5 whitespace-nowrap">
          <div class="font-bold text-slate-800 text-[11px] flex items-center space-x-1">
            <span>${eventIcon}</span>
            <span>${bdayDateText}</span>
          </div>
          ${item.milestone ? `<div class="text-[9px] text-pink-600 font-medium leading-tight">${item.milestone}</div>` : ''}
        </td>

        <!-- 3. Phone -->
        <td class="py-2 px-1.5 whitespace-nowrap">
          ${isCouple && spouseDevotee ? `
            <div class="flex flex-col space-y-0.5 text-[11px]">
              ${d.phone ? `
                <a href="tel:${d.phone}" class="flex items-center space-x-1 font-mono text-slate-700 hover:text-indigo-600" title="Call ${d.phone}">
                  <span class="text-[9px] text-emerald-700 font-bold uppercase bg-emerald-50 border border-emerald-200 rounded px-1">H</span>
                  <span>${d.phone}</span>
                </a>
              ` : ''}
              ${spouseDevotee.phone ? `
                <a href="tel:${spouseDevotee.phone}" class="flex items-center space-x-1 font-mono text-slate-700 hover:text-purple-600" title="Call ${spouseDevotee.phone}">
                  <span class="text-[9px] text-purple-700 font-bold uppercase bg-purple-50 border border-purple-200 rounded px-1">W</span>
                  <span>${spouseDevotee.phone}</span>
                </a>
              ` : ''}
              ${!d.phone && !spouseDevotee.phone ? '<span class="text-slate-400 text-[10px] italic">No phone</span>' : ''}
            </div>
          ` : `
            ${d.phone ? `
              <a href="tel:${d.phone}" class="flex items-center space-x-1 font-mono text-[11px] font-medium text-slate-700 hover:text-indigo-600" title="Call Devotee">
                <span>📞</span>
                <span>${d.phone}</span>
              </a>
            ` : `<span class="text-slate-400 text-[10px] italic">No phone</span>`}
          `}
        </td>

        <!-- 4. City -->
        <td class="py-2 px-1.5 whitespace-nowrap">
          ${isCouple && spouseDevotee ? `
            <div class="flex flex-col space-y-0.5 text-[11px]">
              ${d.city ? `
                <span class="flex items-center space-x-1 font-semibold text-slate-700">
                  <span class="text-[9px] text-emerald-700 font-bold uppercase bg-emerald-50 border border-emerald-200 rounded px-1">H</span>
                  <span>${escapeHtml(d.city)}</span>
                </span>
              ` : ''}
              ${spouseDevotee.city ? `
                <span class="flex items-center space-x-1 font-semibold text-slate-700">
                  <span class="text-[9px] text-purple-700 font-bold uppercase bg-purple-50 border border-purple-200 rounded px-1">W</span>
                  <span>${escapeHtml(spouseDevotee.city)}</span>
                </span>
              ` : ''}
              ${!d.city && !spouseDevotee.city ? '<span class="text-slate-400 text-[10px] italic">—</span>' : ''}
            </div>
          ` : `
            ${d.city ? `<span class="text-[11px] font-semibold text-slate-700">📍 ${escapeHtml(d.city)}</span>` : '<span class="text-slate-400 text-[10px] italic">—</span>'}
          `}
        </td>

        <!-- 5. Mode of Delivery (Delhivery Courier / Self Mode) -->
        <td class="py-2 px-2 text-center whitespace-nowrap">
          <select onchange="setCelebrationDeliveryMode('${d.id}', this.value)" title="Choose how this celebration parcel is delivered"
            class="px-1.5 py-1 text-[10px] font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer focus:ring-2 focus:ring-pink-400 focus:border-pink-400">
            <option value="" ${d.deliveryMode ? '' : 'selected'}>Select Delivery Mode</option>
            <option value="DELHIVERY" ${d.deliveryMode === 'DELHIVERY' ? 'selected' : ''}>Delhivery Courier</option>
            <option value="SELF" ${d.deliveryMode === 'SELF' ? 'selected' : ''}>Self Mode</option>
          </select>
        </td>

        <!-- 6. Parcel (Create Parcel / Created) -->
        <td class="py-2 px-2 text-center whitespace-nowrap">
          ${hasParcel ? `
            <button onclick="viewParcelInTracking('${liveParcel.id}')" 
                    class="inline-flex items-center space-x-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold px-2.5 py-1 rounded-lg text-[11px] transition shadow-xs cursor-pointer" 
                    title="Parcel already created for this celebration — click to view in Parcel Tracking">
              <span>📦</span>
              <span>Created</span>
              <span class="text-[10px] text-emerald-600 font-mono">↗</span>
            </button>
          ` : `
            <button onclick="openCreateParcelModal('${d.id}', '${parcelType}')" 
                    class="inline-flex items-center space-x-1 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] transition shadow-xs hover:shadow cursor-pointer active:scale-95" 
                    title="Create Consignment Parcel for ${escapeHtml(displayName)}">
              <span>📦</span>
              <span>Create Parcel</span>
            </button>
          `}
        </td>

        <!-- 7. Actions (Wish / Remove) — Remove = soft-removal, data is never deleted -->
        <td class="py-2 px-2 whitespace-nowrap">
          <div class="flex items-center justify-end gap-1">
            <button onclick="openWishesModal('${d.id}', '${item.eventType.toLowerCase()}')" class="inline-flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded text-[11px] transition shadow-xs" title="Send a Birthday/Anniversary Wish">
              <i data-lucide="heart" class="w-3 h-3"></i>
              <span>Wish</span>
            </button>
            <button onclick="removeCelebrationEntry('${d.id}', '${item.eventType}')" class="inline-flex items-center space-x-1 bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1 rounded text-[11px] transition shadow-xs" title="Move to Removed section (record is never deleted)">
              <i data-lucide="folder-minus" class="w-3 h-3"></i>
              <span>Remove</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// ----------------------------------------------------
// ANNIVERSARY: Accept / Remove (soft-removal — never deletes data)
// ----------------------------------------------------

// Accept — keep (or restore) a devotee/couple in the Anniversary list, eligible for parcels
async function acceptAnniversaryEntry(devId) {
  if (!requirePermission('manage_celebrations', 'restore entries to the anniversary list')) return;
  const target = getMergedAnniversaryCelebrations().find(it =>
    it.devotee.id === devId || (it.spouseDevotee && it.spouseDevotee.id === devId)
  );
  const ids = target ? (target.coupleIds || [devId]) : [devId];
  const pending = ids.filter(id => (state.anniversaryRemovedIds || []).includes(id));

  // Already in the list — nothing to restore
  if (!pending.length) {
    showToast('✅ Already in the Anniversary list & eligible for parcels.', 'success');
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Restore to Anniversary List?',
    message: `Are you sure you want to restore ${ids.length > 1 ? 'this couple' : 'this devotee'} back to the Anniversary list?\n\nThe record will be eligible for parcels again.`,
    confirmText: 'Restore',
    cancelText: 'Cancel',
    icon: '↩️'
  });
  if (!confirmed) return;

  const before = (state.anniversaryRemovedIds || []).length;
  state.anniversaryRemovedIds = (state.anniversaryRemovedIds || []).filter(id => !ids.includes(id));
  const restoredCount = before - state.anniversaryRemovedIds.length;

  saveToStorage();
  if (restoredCount > 0) showRemovedAnnivSection(false); // return to the main Anniversary list
  renderBirthdaysGrid();
  renderRemovedAnnivSection();
  showToast('✅ Restored to the Anniversary list — now eligible for parcels.', 'success');
  if (window.lucide) lucide.createIcons();
}

// Remove — move a devotee/couple out of the Anniversary list into the Removed section (never deleted)
async function removeAnniversaryEntry(devId) {
  const target = getMergedAnniversaryCelebrations().find(it =>
    it.devotee.id === devId || (it.spouseDevotee && it.spouseDevotee.id === devId)
  );
  if (!target) { showToast('Record not found in the Anniversary list.', 'error'); return; }

  const names = target.isCouple ? target.coupleTitle : (target.devotee.spiritualName || target.devotee.legalName || 'this devotee');
  const confirmed = await showAppConfirm({
    title: 'Remove from Anniversary List?',
    message: `Are you sure you want to remove ${names} from the Anniversary list?\n\nNothing will be deleted — the record stays safe in the Removed section and can be restored anytime.`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗂️'
  });
  if (!confirmed) return;

  const ids = target.coupleIds || [devId];
  state.anniversaryRemovedIds = [...new Set([...(state.anniversaryRemovedIds || []), ...ids])];

  // Drop any leftover ☑ selection for this entry
  if (ids.some(id => state.selectedCelebrations.has(id))) {
    ids.forEach(id => state.selectedCelebrations.delete(id));
    clearCelebrationSelection();
  }

  saveToStorage();
  logActivity('remove', 'Anniversary', `Removed anniversary wish for ${names}.`, ids[0]);
  renderBirthdaysGrid();
  renderRemovedAnnivSection();
  showToast('🗂️ Moved to the Removed section — record is safe & restorable.', 'success');
  if (window.lucide) lucide.createIcons();
}

// Mode of Delivery per celebration (Delhivery Courier / Self Mode) — stored on the devotee record
function setCelebrationDeliveryMode(devId, mode) {
  let ids = [devId];
  // Couples (Anniversary): apply to both husband & wife
  const merged = getMergedAnniversaryCelebrations().find(it =>
    it.devotee.id === devId || (it.spouseDevotee && it.spouseDevotee.id === devId)
  );
  if (merged && merged.coupleIds) ids = merged.coupleIds;

  ids.forEach(id => {
    const dev = state.devotees.find(x => x.id === id);
    if (dev) {
      dev.deliveryMode = mode || '';
      dev.courierPartner = (mode === 'SELF') ? 'Self Pickup' : (mode === 'DELHIVERY' ? 'Delhivery' : '');
      // Self Mode rule: Pre Calling ON / Post Calling OFF — applied automatically
      if (mode === 'SELF') { dev.preCalling = 'Yes'; dev.postCalling = 'No'; }
      syncDevoteeRecordToCloud(dev);
    }
  });

  // Sync the courier partner on any existing live parcel for these devotees
  (state.parcels || []).forEach(p => {
    if (ids.includes(p.devoteeId)) {
      p.courierPartner = (mode === 'SELF') ? 'Self Pickup' : (mode === 'DELHIVERY' ? 'Delhivery' : '');
      p.deliveryMode = mode || '';
      // Self Mode rule applies automatically to every Self Mode consignment
      if (mode === 'SELF') { p.preCalling = 'Yes'; p.postCalling = 'No'; }
    }
  });

  saveToStorage();
  renderBirthdaysGrid();
  if (mode) {
    showToast(mode === 'SELF'
      ? 'Delivery mode: Self Mode (family pickup) ✅'
      : 'Delivery mode: Delhivery Courier ✅', 'success');
  } else {
    showToast('Delivery mode reset to unselected.', 'info');
  }
  if (window.lucide) lucide.createIcons();
}

// Shared action handler — routes to Anniversary (couple) or Birthday (individual) soft-removal
function removeCelebrationEntry(devId, eventType) {
  if (!requirePermission('manage_celebrations', 'remove celebration entries')) return;
  if (eventType === 'MARRIAGE') return removeAnniversaryEntry(devId);
  return removeBirthdayEntry(devId);
}

// Remove — move a devotee out of the Birthday list into the Removed section (never deleted)
async function removeBirthdayEntry(devId) {
  const target = getAllBirthdayCelebrations().find(it =>
    it.devotee.id === devId || (it.spouseDevotee && it.spouseDevotee.id === devId)
  );
  if (!target) { showToast('Record not found in the Birthday list.', 'error'); return; }

  const names = target.devotee.spiritualName || target.devotee.legalName || 'this devotee';
  const confirmed = await showAppConfirm({
    title: 'Remove from Birthday List?',
    message: `Are you sure you want to remove ${names} from the Birthday list?\n\nNothing will be deleted — the record stays safe in the Removed section and can be restored anytime.`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗂️'
  });
  if (!confirmed) return;

  const ids = target.coupleIds || [devId];
  state.birthdayRemovedIds = [...new Set([...(state.birthdayRemovedIds || []), ...ids])];

  // Drop any leftover ☑ selection for this entry
  if (ids.some(id => state.selectedCelebrations.has(id))) {
    ids.forEach(id => state.selectedCelebrations.delete(id));
    clearCelebrationSelection();
  }

  saveToStorage();
  logActivity('remove', 'Birthday', `Removed birthday wish for ${names}.`, ids[0]);
  renderBirthdaysGrid();
  renderRemovedCelebrationSection();
  showToast('🗂️ Moved to the Removed section — record is safe & restorable.', 'success');
  if (window.lucide) lucide.createIcons();
}

// Accept / Restore — bring a devotee back to the Birthday list, eligible for parcels again
async function acceptBirthdayEntry(devId) {
  if (!requirePermission('manage_celebrations', 'restore entries to the birthday list')) return;
  const target = getAllBirthdayCelebrations().find(it =>
    it.devotee.id === devId || (it.spouseDevotee && it.spouseDevotee.id === devId)
  );
  const ids = target ? (target.coupleIds || [devId]) : [devId];
  const pending = ids.filter(id => (state.birthdayRemovedIds || []).includes(id));

  // Already in the list — nothing to restore
  if (!pending.length) {
    showToast('✅ Already in the Birthday list & eligible for parcels.', 'success');
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Restore to Birthday List?',
    message: `Are you sure you want to restore ${ids.length > 1 ? 'this devotees' : 'this devotee'} back to the Birthday list?\n\nThe record will be eligible for parcels again.`,
    confirmText: 'Restore',
    cancelText: 'Cancel',
    icon: '↩️'
  });
  if (!confirmed) return;

  const before = (state.birthdayRemovedIds || []).length;
  state.birthdayRemovedIds = (state.birthdayRemovedIds || []).filter(id => !ids.includes(id));
  const restoredCount = before - state.birthdayRemovedIds.length;

  saveToStorage();
  if (restoredCount > 0) logActivity('restore', 'Birthday', `Restored ${restoredCount} birthday record(s) to the list.`, ids[0]);
  if (restoredCount > 0) showRemovedAnnivSection(false); // return to the main Birthday list
  renderBirthdaysGrid();
  renderRemovedCelebrationSection();
  showToast('✅ Restored to the Birthday list — now eligible for parcels.', 'success');
  if (window.lucide) lucide.createIcons();
}

// Toggle the Removed records panel inside the celebration tabs
function toggleRemovedAnnivSection() {
  const section = document.getElementById('anniv-removed-section');
  const isHidden = !section || section.classList.contains('hidden');
  showRemovedAnnivSection(isHidden);
}

function showRemovedAnnivSection(show) {
  const section = document.getElementById('anniv-removed-section');
  if (!section) return;
  section.classList.toggle('hidden', !show);
  if (show) renderRemovedAnnivSection();
}

// Render the Removed records table (tab-aware: Birthday individuals or Anniversary couples —
// full info preserved — Photo, Name, Legal Name, Spouse, Date, Devotee ID, Phone, Address)
function renderRemovedAnnivSection() {
  renderRemovedCelebrationSection();
}

function renderRemovedCelebrationSection() {
  // Removal Records tab — Birthday & Anniversary removal lists rendered SEPARATELY,
  // both always visible (soft-removed records — nothing is ever deleted).
  const bdayRemoved = state.birthdayRemovedIds || [];
  const annivRemoved = state.anniversaryRemovedIds || [];

  // 1) Birthday Removal List
  const bdayItems = getAllBirthdayCelebrations()
    .filter(it => (it.coupleIds || [it.id]).some(id => bdayRemoved.includes(id)))
    .sort((a, b) => (a.timing && b.timing) ? a.timing.daysRemaining - b.timing.daysRemaining : 0);
  const bdayCount = bdayItems.length || bdayRemoved.length;
  const bdayCountEl = document.getElementById('removed-bday-count');
  if (bdayCountEl) bdayCountEl.innerText = String(bdayCount);
  const bdayListEl = document.getElementById('removed-bday-list');
  if (bdayListEl) {
    bdayListEl.innerHTML = buildRemovedRows({
      items: bdayItems,
      count: bdayCount,
      isAnniv: false,
      emptyText: 'Records removed from the Birthday list appear here — nothing is ever deleted.'
    });
  }

  // 2) Anniversary Removal List (a merged couple = 1 entry, matching the main list)
  const annivItems = getMergedAnniversaryCelebrations()
    .filter(it => (it.coupleIds || [it.id]).some(id => annivRemoved.includes(id)))
    .sort((a, b) => (a.timing && b.timing) ? a.timing.daysRemaining - b.timing.daysRemaining : 0);
  const annivCount = annivItems.length || annivRemoved.length;
  const annivCountEl = document.getElementById('removed-anniv-count');
  if (annivCountEl) annivCountEl.innerText = String(annivCount);
  const annivListEl = document.getElementById('removed-anniv-list');
  if (annivListEl) {
    annivListEl.innerHTML = buildRemovedRows({
      items: annivItems,
      count: annivCount,
      isAnniv: true,
      emptyText: 'Records removed from the Anniversary list appear here — nothing is ever deleted.'
    });
  }

  // Nav badge — total removed entries across both lists
  const navBadge = document.getElementById('nav-removed-badge');
  if (navBadge) {
    const total = bdayCount + annivCount;
    navBadge.innerText = String(total);
    navBadge.classList.toggle('hidden', total === 0);
  }

  if (window.lucide) lucide.createIcons();
}

// Shared row builder for the Removal Records tab lists (Birthday or Anniversary)
function buildRemovedRows({ items = [], count = 0, isAnniv = false, emptyText = '' }) {
  if (!count) {
    return `
      <tr>
        <td colspan="9" class="text-center py-12 text-slate-400">
          <div class="flex flex-col items-center space-y-1.5">
            <span class="text-2xl">🗂️</span>
            <span class="font-bold text-sm text-slate-600">${isAnniv ? 'Anniversary' : 'Birthday'} removal list is empty</span>
            <span class="text-xs text-slate-400">${escapeHtml(emptyText)}</span>
          </div>
        </td>
      </tr>`;
  }

  const buildAddr = (dev) => dev ? ([dev.address, dev.city, dev.pincode, dev.state].filter(Boolean).join(', ')) : '';
  const dateIcon = isAnniv ? '💍' : '🎂';
  const acceptFn = isAnniv ? 'acceptAnniversaryEntry' : 'acceptBirthdayEntry';
  const restoreTitle = isAnniv
    ? 'Restore to the Anniversary list & make eligible for parcels'
    : 'Restore to the Birthday list & make eligible for parcels';

  return items.map(item => {
    const d = item.devotee;
    const spouse = item.spouseDevotee;
    const isCouple = !!item.isCouple && spouse;
    const dateText = item.rawDateStr || formatDate(item.date);

    const photoCell = isCouple ? `
      <div class="relative flex items-center">
        <div class="p-[2px] border border-emerald-400 rounded-sm bg-white relative z-10 shadow-xs cursor-pointer" onclick="handleDevoteeAvatarClick(event, '${d.id}')" title="${escapeHtml(d.legalName || d.spiritualName)}">
          ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
        </div>
        <div class="p-[2px] border border-purple-300 rounded-sm bg-white relative -ml-2.5 z-0 shadow-xs cursor-pointer" onclick="handleDevoteeAvatarClick(event, '${spouse.id}')" title="${escapeHtml(spouse.legalName || spouse.spiritualName)}">
          ${getDevoteeAvatarHtml(spouse, 'w-8 h-8', 'text-[10px]')}
        </div>
      </div>` : `
      <div class="p-[2px] border border-slate-200 rounded-sm bg-white shadow-xs cursor-pointer" onclick="handleDevoteeAvatarClick(event, '${d.id}')" title="${escapeHtml(d.legalName || d.spiritualName)}">
        ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
      </div>`;

    const nameCell = isCouple ? `
      <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')">${escapeHtml(d.legalName || d.spiritualName)}</div>
      <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition mt-1.5" onclick="viewDevoteeProfile('${spouse.id}')">${escapeHtml(spouse.legalName || spouse.spiritualName)}</div>` : `
      <div class="font-bold text-slate-900 text-[13px] leading-tight cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')">${escapeHtml(d.legalName || d.spiritualName)}</div>`;

    const legalCell = (isCouple ? [d, spouse] : [d]).map(dev => {
      const parts = [];
      if (dev.spiritualName) parts.push(`<span class="text-slate-800">${escapeHtml(dev.spiritualName)}</span>`);
      if (dev.legalName && dev.legalName !== dev.spiritualName) parts.push(`<span class="text-slate-400">${escapeHtml(dev.legalName)}</span>`);
      return `<div class="text-[11px] leading-tight">${parts.join(' <span class="text-slate-300">/</span> ')}</div>`;
    }).join('');

    const spouseName = isCouple ? (spouse.spiritualName || spouse.legalName) : (d.spouseName || '—');

    const idCell = (isCouple ? [d, spouse] : [d]).map(dev => `<div class="font-mono text-[10px] text-slate-500">${escapeHtml(dev.id)}</div>`).join('');
    const phoneCell = (isCouple ? [d, spouse] : [d]).map(dev => dev.phone ? `<div class="font-mono text-[11px] text-slate-700">📞 ${escapeHtml(dev.phone)}</div>` : '').join('') || '<span class="text-slate-400 text-[10px] italic">No phone</span>';
    const addrCell = (isCouple ? [d, spouse] : [d]).map(dev => {
      const a = buildAddr(dev);
      return a ? `<div class="text-[10px] text-slate-600 leading-snug">${escapeHtml(a)}</div>` : '';
    }).join('') || '<span class="text-slate-400 text-[10px] italic">No address</span>';

    return `
      <tr class="hover:bg-amber-50/50 transition border-b border-slate-100">
        <td class="py-2 px-3">${photoCell}</td>
        <td class="py-2 px-3 min-w-[220px]">${nameCell}</td>
        <td class="py-2 px-3 min-w-[180px]">${legalCell}</td>
        <td class="py-2 px-3 text-[11px] text-slate-700">${escapeHtml(spouseName)}</td>
        <td class="py-2 px-3 whitespace-nowrap text-[11px] text-slate-800 font-semibold">${dateIcon} ${dateText}</td>
        <td class="py-2 px-3">${idCell}</td>
        <td class="py-2 px-3 whitespace-nowrap">${phoneCell}</td>
        <td class="py-2 px-3 min-w-[200px]">${addrCell}</td>
        <td class="py-2 px-3 text-right whitespace-nowrap">
          <button onclick="${acceptFn}('${d.id}')" class="inline-flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-[11px] transition shadow-xs cursor-pointer" title="${restoreTitle}">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            <span>Restore</span>
          </button>
        </td>
      </tr>`;
  }).join('');
}

// Restore EVERY Birthday record back to the Birthday list
async function restoreAllBirthdayRemoved() {
  if (!requirePermission('manage_celebrations', 'restore birthday entries in bulk')) return;
  const removed = state.birthdayRemovedIds || [];
  if (!removed.length) { showToast('Birthday removal list is already empty.', 'info'); return; }

  const confirmed = await showAppConfirm({
    title: 'Restore All Birthday Records?',
    message: `Are you sure you want to restore ALL ${removed.length} removed Birthday record(s) back to the Birthday list?\n\nEvery record will be eligible for parcels again.`,
    confirmText: 'Restore All',
    cancelText: 'Cancel',
    icon: '↩️'
  });
  if (!confirmed) return;

  const n = removed.length;
  state.birthdayRemovedIds = [];
  saveToStorage();
  logActivity('restore', 'Birthday', `Restored all ${n} removed birthday record(s).`);
  renderBirthdaysGrid();
  renderRemovedCelebrationSection();
  showToast(`✅ Restored ${n} record(s) back to the Birthday list.`, 'success');
  if (window.lucide) lucide.createIcons();
}

// Restore EVERY Anniversary couple back to the Anniversary list
async function restoreAllAnniversaryRemoved() {
  if (!requirePermission('manage_celebrations', 'restore anniversary entries in bulk')) return;
  const removed = state.anniversaryRemovedIds || [];
  if (!removed.length) { showToast('Anniversary removal list is already empty.', 'info'); return; }

  const confirmed = await showAppConfirm({
    title: 'Restore All Anniversary Records?',
    message: `Are you sure you want to restore ALL ${removed.length} removed Anniversary couple record(s) back to the Anniversary list?\n\nEvery record will be eligible for parcels again.`,
    confirmText: 'Restore All',
    cancelText: 'Cancel',
    icon: '↩️'
  });
  if (!confirmed) return;

  const n = removed.length;
  state.anniversaryRemovedIds = [];
  saveToStorage();
  logActivity('restore', 'Anniversary', `Restored all ${n} removed anniversary record(s).`);
  renderBirthdaysGrid();
  renderRemovedCelebrationSection();
  showToast(`✅ Restored ${n} couple record(s) back to the Anniversary list.`, 'success');
  if (window.lucide) lucide.createIcons();
}

function getMonthName(m) {
  const names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return names[m] || '';
}

// ----------------------------------------------------
// FLIPKART & AMAZON PARCEL TRACKING SYSTEM
// ----------------------------------------------------
let activeTrackingDevotee = null;

// Courier-aware tracking page links — clicking the Tracking Number opens the
// relevant courier's parcel tracking page in a new tab.
const COURIER_TRACKING_PAGES = {
  // Each carrier: base tracking page + the query parameter it uses to pre-fill the search box
  'Delhivery': { base: 'https://www.delhivery.com/track', param: 'trackingId' },
  'Blue Dart': { base: 'https://www.bluedart.com/tracking/CustomerTracking.action', param: 'awbno', prefix: 'actionId=trackcust' },
  'India Post': { base: 'https://www.indiapost.gov.in/VAS/Pages/TrackConsignment.aspx', param: 'TokenNo' },
  'DTDC': { base: 'https://www.dtdc.in/tracking/TrackingDownShipment.asp', param: 'strCnno' },
  'ISKCON Seva Courier': { base: 'https://www.delhivery.com/track', param: 'trackingId' }
};

function getCourierTrackingUrl(courier, trackingNo) {
  const name = String(courier || '').trim().toLowerCase();
  const no = (trackingNo && trackingNo !== '—' ? String(trackingNo).trim() : '');

  for (const key in COURIER_TRACKING_PAGES) {
    if (name.includes(key.toLowerCase())) {
      const cfg = COURIER_TRACKING_PAGES[key];
      const params = [];
      if (cfg.prefix) params.push(cfg.prefix);
      if (no && cfg.param) params.push(cfg.param + '=' + encodeURIComponent(no));
      return params.length ? cfg.base + '?' + params.join('&') : cfg.base;
    }
  }

  // Unknown courier — search the tracking number directly on Google
  if (no) {
    return `https://www.google.com/search?q=${encodeURIComponent(no)}`;
  }
  return 'https://www.delhivery.com/track';
}

// Mode of Delivery label for any record (devotee or consignment).
// NEVER invents a mode: a record with no chosen mode returns ''.
function deriveDeliveryModeLabel(rec) {
  const cp = String((rec && rec.courierPartner) || '').toLowerCase().trim();
  const mode = String((rec && rec.deliveryMode) || '').trim().toUpperCase();
  if (['self pickup', 'self mode', 'self'].includes(cp) || mode === 'SELF') return 'Self Mode';
  if (['delhivery', 'delhivery courier'].includes(cp) || mode === 'DELHIVERY') return 'Delhivery Courier';
  return '';
}

// Mode of Delivery for a consignment (Delhivery Courier / Self Mode) —
// replaces the old Courier Partner display in the Tracking tab. The real
// courierPartner is still kept in the record only to build tracking links.
function getParcelDeliveryModeLabel(p) {
  const devo = (state.devotees || []).find(x => x.id === (p && p.devoteeId)) || {};
  // The consignment's own courierPartner / deliveryMode is authoritative (Self Pickup persists
  // per parcel even if the devotee is later switched back); the devotee profile is a fallback.
  return deriveDeliveryModeLabel({
    courierPartner: (p && p.courierPartner) || devo.courierPartner,
    deliveryMode: (p && p.deliveryMode) || devo.deliveryMode
  });
}

// Clear EVERY filter in the Parcel & Tracking toolbar (Mode / Purpose / Date / Search)
function clearParcelFilters() {
  const modeEl = document.getElementById('parcel-filter-mode');
  if (modeEl) modeEl.value = 'ALL';
  const purposeEl = document.getElementById('parcel-filter-purpose');
  if (purposeEl) purposeEl.value = 'ALL';
  const searchEl = document.getElementById('parcel-filter-search');
  if (searchEl) searchEl.value = '';
  const dateEl = document.getElementById('parcel-filter-date');
  if (dateEl) dateEl.value = '';
  const dateClearBtn = document.getElementById('parcel-date-clear');
  if (dateClearBtn) dateClearBtn.classList.add('hidden');
  renderParcelsTable();
  showToast('All parcel filters cleared', 'info');
}

// Date View — exact created-date filter for the Parcel & Tracking list
function handleParcelDateChange() {
  const input = document.getElementById('parcel-filter-date');
  const clearBtn = document.getElementById('parcel-date-clear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !(input && input.value));
  renderParcelsTable();
}

function clearParcelDate() {
  const input = document.getElementById('parcel-filter-date');
  if (input) input.value = '';
  const clearBtn = document.getElementById('parcel-date-clear');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderParcelsTable();
}

// Normalize a parcel's creation timestamp to its LOCAL YYYY-MM-DD date string
function getParcelCreatedDate(p) {
  const ts = p && (p.createdAt || p.bookingDate || p.parcelCreatedAt || '');
  if (!ts) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts; // already a plain date
  const dt = new Date(ts);
  if (isNaN(dt.getTime())) return '';
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

function renderParcelsTable() {
  const tableBody = document.getElementById('parcels-table-body');
  if (!tableBody) return;

  updateParcelKpiCards(); // keep the KPI cards live on every render

  const modeFilter = document.getElementById('parcel-filter-mode') ? document.getElementById('parcel-filter-mode').value : 'ALL';
  const purposeFilter = document.getElementById('parcel-filter-purpose') ? document.getElementById('parcel-filter-purpose').value : 'ALL';
  const search = document.getElementById('parcel-filter-search') ? document.getElementById('parcel-filter-search').value.toLowerCase().trim() : '';
  const dateFilter = document.getElementById('parcel-filter-date') ? document.getElementById('parcel-filter-date').value : '';
  updateParcelKpiCardHighlights(purposeFilter);

  // Parcel Tracking lists ONLY live auto-synced parcel records — created from the
  // Birthday / Anniversary lists. No calendar-based filtering anymore.
  const parcels = state.parcels || [];
  const dupMap = getParcelsDuplicateMap();

  const filtered = parcels.filter(p => {
    // 1. Mode of Delivery Filter (Delhivery Courier / Self Mode)
    if (modeFilter !== 'ALL') {
      if (getParcelDeliveryModeLabel(p) !== modeFilter) return false;
    }

    // 1a. Date Created filter — exact local date the consignment was created
    if (dateFilter && getParcelCreatedDate(p) !== dateFilter) return false;

    // 1b. Purpose Filter (All / Birthday / Anniversary / Duplicates)
    if (purposeFilter === 'DUPLICATES') {
      if (!dupMap.has(p.id)) return false;
    } else if (purposeFilter !== 'ALL') {
      const purpose = p.parcelType || p.eventType || '';
      if (purpose !== purposeFilter) return false;
    }

    // 2. Search Filter
    if (search) {
      const trk = (p.courierTrackingNo || p.trackingId || '').toLowerCase();
      const sName = (p.spiritualName || '').toLowerCase();
      const lName = (p.legalName || '').toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      const city = (p.city || '').toLowerCase();
      const pin = (p.pincode || '').toLowerCase();
      const id = (p.devoteeId || '').toLowerCase();
      if (!trk.includes(search) && !sName.includes(search) && !lName.includes(search) && !phone.includes(search) && !city.includes(search) && !pin.includes(search) && !id.includes(search)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    const ta = a.createdAt || a.bookingDate || a.parcelCreatedAt || '';
    const tb = b.createdAt || b.bookingDate || b.parcelCreatedAt || '';
    if (ta && tb) return new Date(tb) - new Date(ta);
    if (ta) return -1;
    if (tb) return 1;
    return 0;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-14 text-slate-400">
          <div class="flex flex-col items-center space-y-2">
            <span class="text-3xl">📦</span>
            <span class="font-bold text-sm text-slate-700">No parcels in tracking yet</span>
            <span class="text-xs text-slate-400 max-w-sm">Parcels appear here automatically the moment you click <b>Create Parcel</b> in the Birthday / Anniversary celebration list.</span>
          </div>
        </td>
      </tr>
    `;
    const emptyPag = document.getElementById('parcels-pagination');
    if (emptyPag) {
      emptyPag.innerHTML = `
        <div>Showing <strong>0</strong> of <strong>0</strong> live consignments (auto-synced from Birthday / Anniversary lists)</div>
        <div class="text-[11px] text-slate-500">Logistics Hub: Sri Sri Radha Madan Mohan Mandir, Durgapur</div>
      `;
    }
    updateParcelSelectAllCheckbox();
    updateParcelSelectedCountUI();
    return;
  }

  // Render Table Rows — S.No., Recipient, Purpose, Tracking No. (clickable → carrier page
  // with the number auto-filled), a click-to-toggle Delivery status, and Delete.
  tableBody.innerHTML = filtered.map((p, idx) => {
    // Merge the live parcel record over the devotee profile so every consignment
    // detail (courier, tracking no, parcel type) reflects the actual record.
    const devo = state.devotees.find(x => x.id === p.devoteeId) || {};
    const d = Object.assign({}, devo, p, { id: p.devoteeId, parcelCreated: true });
    const displayName = p.devoteeName || d.spiritualName || d.legalName;
    const secondaryName = d.spiritualName ? d.legalName : '';
    const courier = d.courierPartner || 'Delivery Courier';
    const deliveryModeLabel = getParcelDeliveryModeLabel(p);
    const isSelfMode = deliveryModeLabel === 'Self Mode';
    const purpose = d.parcelType || d.eventType || (d.birthdayRaw ? 'Birthday' : 'Anniversary');
    const purposePill = purpose === 'Anniversary'
      ? '<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">💍 <span>Anniversary</span></span>'
      : '<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-pink-100 text-pink-800 border border-pink-200">🎂 <span>Birthday</span></span>';
    const serialNo = String(idx + 1).padStart(2, '0');
    const delivered = d.delivered === true;
    const isSel = (state.selectedParcels || new Set()).has(p.id);
    const isDup = dupMap.has(p.id);
    const dupInfo = dupMap.get(p.id);

    return `
      <tr id="parcel-row-${p.id}" class="hover:bg-slate-50/80 transition${isSel ? ' bg-red-50/50' : ''}">
        <!-- 0. Select -->
        <td class="py-2.5 px-3 text-center">
          <input type="checkbox" data-id="${p.id}" onchange="toggleParcelSelection('${p.id}', this.checked, this)" ${isSel ? 'checked' : ''} class="parcel-row-checkbox w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer" title="Select for bulk actions">
        </td>
        <!-- 1. S.No. -->
        <td class="py-2.5 px-3 text-center">
          <span class="font-mono font-bold text-slate-400">${serialNo}</span>
        </td>

        <!-- 2. Recipient -->
        <td class="py-2.5 px-3">
          <div class="flex items-center space-x-2.5">
            ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
            <div>
              <div class="font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition text-xs" onclick="viewDevoteeProfile('${d.id}')">${displayName}</div>
              <div class="text-[10px] text-slate-500 font-mono">${secondaryName ? secondaryName + ' • ' : ''}${d.phone || ''}</div>
            </div>
          </div>
        </td>

        <!-- 3. Purpose -->
        <td class="py-2.5 px-3">
          ${purposePill}
        </td>

        <!-- 4. Tracking Number — Self Mode: locked (no tracking needed); Delhivery: 13-14 digits mandatory -->
        <td class="py-2.5 px-3">
          ${isSelfMode ? `
          <div class="flex items-center gap-1 min-w-[210px]">
            <div class="w-36 p-1.5 border border-rose-200 rounded-lg bg-rose-50 text-rose-500 text-[12px] font-bold tracking-wider text-center flex items-center justify-center gap-1.5 cursor-not-allowed select-none" title="Self Mode (temple pickup) — tracking number is locked and not required">
              <span class="text-sm leading-none">🔒</span><span>No Tracking</span>
            </div>
            <span class="text-rose-500 font-bold text-sm leading-none" title="Locked — not required for Self Mode">❌</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">🏠 Self Mode</span>
            <span class="text-[9px] text-amber-700 font-bold">🔒 Temple pickup — tracking locked</span>
          </div>
          ` : `
          <div class="flex items-center gap-1 min-w-[210px]">
            <input type="text" 
                   id="pt-trk-${p.id}" 
                   value="${d.courierTrackingNo ? escapeHtml(d.courierTrackingNo) : ''}" 
                   placeholder="13-14 digit number *" 
                   maxlength="14" 
                   inputmode="numeric" 
                   pattern="[0-9]{13,14}" 
                   oninput="this.value = this.value.replace(/\\D/g, '').slice(0, 14);" 
                   onkeydown="if(event.key==='Enter'){event.preventDefault();saveParcelTracking('${p.id}')}" 
                   class="w-32 p-1.5 border border-slate-300 rounded-lg text-[12px] font-mono font-bold text-sky-900 bg-sky-50/50 focus:ring-2 focus:ring-sky-500 tracking-wider text-center" 
                   title="Enter 13-14 digits and click Save">
            <button onclick="saveParcelTracking('${p.id}')" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-[10px] transition whitespace-nowrap shadow-xs cursor-pointer" title="Save tracking number">Save</button>
            ${d.courierTrackingNo ? `<a href="${getCourierTrackingUrl(courier, d.courierTrackingNo)}" target="_blank" rel="noopener" class="text-sky-500 hover:text-sky-800 p-1 text-sm leading-none" title="${d.courierTrackingNo} — open ${courier} tracking page">↗</a>` : ''}
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200">🚚 Delhivery Courier</span>
          </div>
          ${d.courierTrackingNo
            ? `<div class="text-[9px] text-slate-400 mt-1 font-mono">${d.courierTrackingNo}</div>`
            : `<div class="text-[9px] text-rose-500 font-bold mt-1">* 13-14 Digits Mandatory</div>`}
          `}
        </td>

        <!-- 5. Pre Calling — Yes/No toggle (editable for EVERY parcel, incl. Self Mode — lock removed) -->
        <td class="py-2.5 px-3 text-center">
          <div class="call-toggle inline-flex items-center gap-0.5 p-1 bg-slate-100 border border-slate-200 rounded-lg" id="parcel-cell-pre-${p.id}" title="${isSelfMode ? 'Self Mode defaults to ON — now editable manually' : 'Toggle Pre Calling'}" style="${isSelfMode ? 'border-color:#a7f3d0;background:#ecfdf5;' : ''}">
            <button type="button" class="${d.preCalling === 'Yes' ? TGL_YES_ACTIVE : TGL_IDLE_YES}" onclick="toggleParcelCalling('${p.id}', 'preCalling', 'Yes')">Yes</button>
            <button type="button" class="${d.preCalling === 'No' ? TGL_NO_ACTIVE : TGL_IDLE_NO}" onclick="toggleParcelCalling('${p.id}', 'preCalling', 'No')">No</button>
            <input type="hidden" id="pc-pre-${p.id}" value="${d.preCalling || ''}">
          </div>
          ${isSelfMode ? '<div class="text-[9px] text-emerald-700 font-bold mt-0.5">🏠 Self Mode — editable now</div>' : ''}
        </td>

        <!-- 6. Post Calling — Yes/No toggle (Self Mode: locked OFF ❌) -->
        <td class="py-2.5 px-3 text-center">
          ${isSelfMode ? `
          <div class="call-toggle inline-flex items-center gap-0.5 p-1 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed" id="parcel-cell-post-${p.id}" title="Self Mode — Post Calling always OFF (locked)">
            <button type="button" disabled class="${TGL_IDLE_YES} cursor-not-allowed select-none" style="pointer-events:none">Yes</button>
            <button type="button" disabled class="${TGL_NO_ACTIVE} opacity-90 cursor-not-allowed select-none" style="pointer-events:none">No</button>
            <span class="text-[10px] leading-none pl-0.5">🔒</span>
            <input type="hidden" id="pc-post-${p.id}" value="No">
          </div>
          ` : `
          <div class="call-toggle inline-flex items-center gap-0.5 p-1 bg-slate-100 border border-slate-200 rounded-lg" id="parcel-cell-post-${p.id}">
            <button type="button" class="${d.postCalling === 'Yes' ? TGL_YES_ACTIVE : TGL_IDLE_YES}" onclick="toggleParcelCalling('${p.id}', 'postCalling', 'Yes')">Yes</button>
            <button type="button" class="${d.postCalling === 'No' ? TGL_NO_ACTIVE : TGL_IDLE_NO}" onclick="toggleParcelCalling('${p.id}', 'postCalling', 'No')">No</button>
            <input type="hidden" id="pc-post-${p.id}" value="${d.postCalling || ''}">
          </div>
          `}
        </td>

        <!-- 7. Status — Delivery Toggle (requires confirmation) -->
        <td class="py-2.5 px-3 text-center">
          <button onclick="toggleParcelDelivered('${p.id}', '${d.id}')" title="Click to change delivery status" class="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition cursor-pointer border ${delivered ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'}">
            <span class="text-sm leading-none">${delivered ? '🟢' : '🔴'}</span>
            <span>${delivered ? 'Delivered' : 'Not Delivered'}</span>
          </button>
        </td>

        <!-- 8. Action (Delete — requires confirmation) -->
        <td class="py-2.5 px-3 text-center">
          <button onclick="deleteParcelRecord('${p.id}', '${d.id}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center justify-center space-x-1 shadow-sm cursor-pointer" title="Permanently delete this consignment">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Delete</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Pagination info
  const pag = document.getElementById('parcels-pagination');
  if (pag) {
    pag.innerHTML = `
      <div>Showing <strong class="font-bold text-slate-800">${filtered.length}</strong> of <strong class="font-bold text-slate-800">${parcels.length}</strong> live consignments (auto-synced from Birthday / Anniversary lists)</div>
      <div class="text-[11px] text-slate-500">Logistics Hub: Sri Sri Radha Madan Mohan Mandir, Durgapur</div>
    `;
  }

  updateParcelSelectAllCheckbox();
  updateParcelSelectedCountUI();

  if (window.lucide) lucide.createIcons();
}

// Jump directly to a parcel row in the Parcel Tracking tab and flash highlight it
function viewParcelInTracking(parcelId) {
  switchTab('parcels');
  setTimeout(() => {
    const row = document.getElementById(`parcel-row-${parcelId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('bg-amber-100/80', 'ring-2', 'ring-amber-400');
      setTimeout(() => {
        row.classList.remove('bg-amber-100/80', 'ring-2', 'ring-amber-400');
      }, 3500);
    }
  }, 250);
}

// ----------------------------------------------------
// DELIVERY TOGGLE — mark a consignment Delivered / Not Delivered with confirmation
// ----------------------------------------------------
async function toggleParcelDelivered(parcelId, devoteeId) {
  if (!state.parcels) state.parcels = [];
  const p = state.parcels.find(x => x.id === parcelId);
  if (!p) return;

  const nextStatus = (p.delivered === true) ? 'Not Delivered' : 'Delivered';
  const confirmed = await showAppConfirm({
    title: 'Status Confirmation',
    message: `Are you sure you want to change Status to ${nextStatus}?`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    icon: (nextStatus === 'Delivered') ? '📦' : '⚠️',
    isDanger: (nextStatus === 'Not Delivered')
  });

  if (!confirmed) return;

  p.delivered = (nextStatus === 'Delivered');
  p.deliveredAt = p.delivered ? new Date().toISOString() : '';
  localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels));
  const _pName = p.devoteeName || p.spiritualName || p.legalName || (state.devotees.find(x => x.id === devoteeId) || {}).legalName || 'devotee';
  logActivity('edit', 'Parcel', `Parcel for "${_pName}" marked ${nextStatus}.`, parcelId);

  // Mirror onto the devotee record too
  const devo = state.devotees.find(x => x.id === devoteeId);
  if (devo) {
    devo.delivered = p.delivered;
    devo.deliveredAt = p.deliveredAt;
  }

  renderParcelsTable();
  updateKPIs();

  // Persist to Supabase
  if (getSupabaseClient()) {
    syncParcelToSupabase(p);
  } else {
    console.warn('Supabase not available — delivery status saved locally only.');
  }

  showToast(`Status changed to ${nextStatus}`, 'success');
}

// ----------------------------------------------------
// PARCEL SELECTION (Bulk Delete)
// ----------------------------------------------------
function toggleParcelSelection(devoteeId, checked, elem) {
  if (checked) {
    state.selectedParcels.add(devoteeId);
    if (elem) elem.closest('tr')?.classList.add('bg-red-50/50');
  } else {
    state.selectedParcels.delete(devoteeId);
    if (elem) elem.closest('tr')?.classList.remove('bg-red-50/50');
  }
  updateParcelSelectAllCheckbox();
  updateParcelSelectedCountUI();
}

function toggleSelectAllParcels(checked) {
  const checkboxes = document.querySelectorAll('#parcels-table-body input.parcel-row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    const devoteeId = cb.getAttribute('data-id');
    if (devoteeId) {
      if (checked) {
        state.selectedParcels.add(devoteeId);
        cb.closest('tr')?.classList.add('bg-red-50/50');
      } else {
        state.selectedParcels.delete(devoteeId);
        cb.closest('tr')?.classList.remove('bg-red-50/50');
      }
    }
  });
  updateParcelSelectAllCheckbox();
  updateParcelSelectedCountUI();
}

function updateParcelSelectAllCheckbox() {
  const selectAll = document.getElementById('parcel-select-all');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('#parcels-table-body input.parcel-row-checkbox');
  if (checkboxes.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function updateParcelSelectedCountUI() {
  const count = state.selectedParcels ? state.selectedParcels.size : 0;
  const btnBadge = document.getElementById('parcel-selected-badge');
  if (btnBadge) {
    if (count > 0) {
      btnBadge.innerText = count;
      btnBadge.classList.remove('hidden');
    } else {
      btnBadge.classList.add('hidden');
    }
  }
}

function clearParcelSelection() {
  if (state.selectedParcels) {
    state.selectedParcels.clear();
  }
  const checkboxes = document.querySelectorAll('#parcels-table-body input.parcel-row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
    cb.closest('tr')?.classList.remove('bg-red-50/50');
  });
  updateParcelSelectAllCheckbox();
  updateParcelSelectedCountUI();
}

async function bulkDeleteParcels() {
  if (!isSuperAdmin()) {
    showToast('⛔ Bulk deletion is restricted to Super Admin only. Please submit individual deletion requests.', 'error');
    return;
  }
  if (!state.selectedParcels || state.selectedParcels.size === 0) {
    showToast('Please select at least one parcel record to delete', 'error');
    return;
  }

  const count = state.selectedParcels.size;
  const confirmed = await showAppConfirm({
    title: 'Delete Selected Consignments',
    message: `Are you sure you want to permanently delete ${count} selected parcel consignment${count > 1 ? 's' : ''}? This cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗑️'
  });
  if (!confirmed) return;

  const idsToDelete = new Set(state.selectedParcels);
  const devoteeIds = new Set();
  state.parcels = (state.parcels || []).filter(p => {
    if (idsToDelete.has(p.id)) {
      devoteeIds.add(p.devoteeId);
      return false;
    }
    return true;
  });

  // Remove the parcel trace from those devotees so their celebration row goes
  // back to a clean "Create Parcel" state.
  (state.devotees || []).forEach(d => {
    if (devoteeIds.has(d.id)) clearDevoteeParcelTrace(d);
  });

  state.selectedParcels.clear();
  saveToStorage();
  logActivity('delete', 'Parcel', `Deleted ${count} parcel consignment(s).`);
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  const idsToDeleteArr = Array.from(idsToDelete);

  // 1. Mark in tombstone set so they can NEVER resurrect
  markParcelsAsDeleted(idsToDeleteArr);

  state.parcels = (state.parcels || []).filter(p => {
    if (idsToDelete.has(p.id)) {
      devoteeIds.add(p.devoteeId);
      return false;
    }
    return true;
  });

  // Remove the parcel trace from those devotees so their celebration row goes
  // back to a clean "Create Parcel" state.
  (state.devotees || []).forEach(d => {
    if (devoteeIds.has(d.id)) {
      const remaining = state.parcels.find(p => p.devoteeId === d.id);
      if (!remaining) {
        clearDevoteeParcelTrace(d);
      } else {
        d.hasParcel = true;
        d.parcelCreated = true;
        d.parcelId = remaining.id;
      }
    }
  });

  state.selectedParcels.clear();
  saveToStorage();
  try {
    localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels));
  } catch (e) {}

  logActivity('delete', 'Parcel', `Deleted ${count} parcel consignment(s).`);
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();

  // 2. Direct delete from Supabase Cloud (AWAITED)
  try {
    const client = getSupabaseClient();
    if (client) {
      for (let i = 0; i < idsToDeleteArr.length; i += 50) {
        const chunk = idsToDeleteArr.slice(i, i + 50);
        const { error } = await client.from('parcels').delete().in('id', chunk);
        if (error) {
          console.warn('⚠️ Supabase bulk parcel delete warning:', error.message);
        }
      }
      console.log(`✅ Permanently deleted ${idsToDeleteArr.length} parcels from Supabase Cloud.`);
    }
  } catch (e) {
    console.warn('Bulk parcel delete exception:', e);
  }

  showToast(`Deleted ${count} parcel record${count > 1 ? 's' : ''} permanently`, 'success');
}


async function deleteParcelRecord(parcelId, devoteeId) {
  const p = (state.parcels || []).find(x => x.id === parcelId);
  const dev = state.devotees.find(x => x.id === devoteeId);
  const name = (dev && (dev.spiritualName || dev.legalName)) || (p && (p.spiritualName || p.legalName)) || 'this devotee';

  // 🛡️ ROLE-BASED ACCESS CONTROL:
  // Non-Super Admins CANNOT delete directly — open Delete Request Modal for Super Admin approval!
  if (!isSuperAdmin()) {
    if (isViewer()) {
      showToast('⛔ Viewers cannot delete or request deletion of parcel records.', 'error');
      return;
    }
    openDeleteRequestModal({
      id: parcelId,
      type: 'PARCEL',
      title: `Consignment for ${name} (Tracking: ${p?.trackingNumber || parcelId})`
    });
    return;
  }

  const confirmed = await showAppConfirm({
    title: 'Delete Consignment (Super Admin)',
    message: `Are you sure you want to permanently delete this parcel consignment for ${name}? This cannot be undone.`,
    confirmText: 'Delete Permanently',
    cancelText: 'Cancel',
    isDanger: true,
    icon: '🗑️'
  });
  if (!confirmed) return;

  // 1. Record ID in tombstone set immediately so it can NEVER resurrect
  markParcelsAsDeleted(parcelId);

  // 2. Remove from local state and update devotee parcel trace
  state.parcels = (state.parcels || []).filter(p => p.id !== parcelId);
  if (dev) {
    const remainingParcel = state.parcels.find(x => x.devoteeId === devoteeId);
    if (!remainingParcel) {
      clearDevoteeParcelTrace(dev);
    } else {
      dev.hasParcel = true;
      dev.parcelCreated = true;
      dev.parcelId = remainingParcel.id;
      if (remainingParcel.courierTrackingNo) dev.courierTrackingNo = remainingParcel.courierTrackingNo;
    }
  }
  if (state.selectedParcels) state.selectedParcels.delete(parcelId);
  saveToStorage();
  try {
    localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels));
  } catch (e) {}

  logActivity('delete', 'Parcel', `Deleted parcel consignment for "${name}".`, parcelId);
  updateKPIs();
  renderParcelsTable();
  renderBirthdaysGrid();
  renderDevoteesTable();

  // 3. IMMEDIATELY DELETE FROM SUPABASE CLOUD DATABASE (AWAITED)
  try {
    const client = getSupabaseClient();
    if (client) {
      const { error } = await client.from('parcels').delete().eq('id', parcelId);
      if (error) {
        console.warn('⚠️ Supabase cloud parcel delete notice:', error.message);
      } else {
        console.log('✅ Parcel deleted from Supabase Cloud:', parcelId);
      }
    }
  } catch (e) {
    console.warn('Supabase cloud delete exception:', e);
  }

  showToast('Parcel consignment deleted permanently.', 'success');
}

function handleQuickParcelSearch() {
  const input = document.getElementById('quick-parcel-search-input');
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  if (!q) {
    showToast('Please enter a tracking ID, devotee name, or phone number', 'error');
    return;
  }

  const match = (state.parcels || []).find(p => {
    const trk = (p.trackingId || '').toLowerCase();
    const id = (p.devoteeId || '').toLowerCase();
    const sName = (p.spiritualName || '').toLowerCase();
    const lName = (p.legalName || '').toLowerCase();
    const phone = (p.phone || '').toLowerCase();
    return trk === q || trk.includes(q) || id === q || id.includes(q) || sName.includes(q) || lName.includes(q) || phone.includes(q);
  });

  if (match) {
    openParcelTrackerModal(match.devoteeId);
  } else {
    showToast(`No live parcel found — create one from the Birthday / Anniversary list first.`, 'error');
  }
}

function openParcelTrackerModal(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  activeTrackingDevotee = d;
  const displayName = d.spiritualName || d.legalName;
  const secondaryName = d.spiritualName ? `(${d.legalName})` : '';
  const trackingNo = d.courierTrackingNo || '—';
  const courier = d.courierPartner || 'Delivery Courier';
  const pin = d.pincode || '713204';

  // Fill Header —— Tracking Number links straight to the courier's tracking page
  const ptTrkIdEl = document.getElementById('pt-tracking-id');
  if (ptTrkIdEl) {
    const trkUrl = getCourierTrackingUrl(courier, trackingNo);
    ptTrkIdEl.innerHTML = `<a href="${trkUrl}" target="_blank" rel="noopener" title="Open the ${courier} tracking page in a new tab" class="text-white font-mono underline decoration-sky-400/70 hover:text-sky-300 transition inline-flex items-center space-x-1"><i data-lucide="external-link" class="w-3 h-3"></i><span>${trackingNo}</span></a>`;
  }
  const carrierBadge = document.getElementById('pt-carrier-badge');
  if (carrierBadge) {
    carrierBadge.innerText = courier;
    carrierBadge.className = 'bg-red-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm';
  }

  // Fill Recipient Address
  document.getElementById('pt-devotee-name').innerText = d.legalName || displayName;
  document.getElementById('pt-spiritual-name').innerText = d.spiritualName || 'Congregation Devotee';
  document.getElementById('pt-address').innerText = d.address || `${d.city || 'Durgapur'}, West Bengal`;
  document.getElementById('pt-pincode').innerText = pin;
  document.getElementById('pt-phone').innerText = d.phone || 'N/A';
  
  const addrBadge = document.getElementById('pt-addr-badge');
  if (addrBadge) {
    if (isDevoteAddressVerified(d)) {
      addrBadge.className = 'bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full';
      addrBadge.innerText = 'Verified Address ✅';
    } else {
      addrBadge.className = 'bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full';
      addrBadge.innerText = 'Address Verification Needed ⚠️';
    }
  }

  // Fill Mode of Delivery (Delhivery Courier / Self Mode)
  const courierNameEl = document.getElementById('pt-courier-name');
  if (courierNameEl) {
    courierNameEl.innerText = getParcelDeliveryModeLabel({ devoteeId: d.id, deliveryMode: d.deliveryMode, courierPartner: d.courierPartner });
    courierNameEl.className = 'bg-red-50 text-red-600 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full';
  }
  document.getElementById('pt-agent-name').innerText = d.deliveryAgent || 'Rajesh Sharma (+91 94341 00212)';

  // Fill Package Contents and Expected Delivery Date
  const ptContentsEl = document.getElementById('pt-contents');
  if (ptContentsEl) {
    if (d.parcelType || d.parcelDescription) {
      ptContentsEl.innerText = `${d.parcelType ? d.parcelType + ' — ' : ''}${d.parcelDescription || 'Holy Maha-Prasadam Sweets, Srimad Bhagavad-gita, Birthday Scroll'}`;
    } else {
      ptContentsEl.innerText = 'Holy Maha-Prasadam Sweets, Srimad Bhagavad-gita, Birthday Scroll';
    }
  }
  document.getElementById('parcel-tracker-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function renderScansTimeline(d, step) {
  const container = document.getElementById('pt-scans-timeline');
  if (!container) return;

  const city = d.city || 'Durgapur';
  const courier = d.courierPartner || 'Delivery Courier';

  const scans = [];
  if (step >= 5) {
    scans.push({
      time: 'Today 01:15 PM',
      title: 'Delivered',
      desc: `Delivered to recipient at ${city}. Signed and received with Dandavat Pranams.`,
      color: 'bg-emerald-600'
    });
  }
  if (step >= 4) {
    scans.push({
      time: 'Today 09:30 AM',
      title: 'Out for Delivery',
      desc: `Package out for delivery with courier associate. Contact: ${d.deliveryAgent || '+91 94341 00212'}`,
      color: 'bg-purple-600'
    });
  }
  if (step >= 3) {
    scans.push({
      time: 'Yesterday 08:20 PM',
      title: 'Arrived at Local Logistics Hub',
      desc: `Package scanned at sorting center near ${city} (${d.pincode || '713204'}).`,
      color: 'bg-blue-600'
    });
    scans.push({
      time: '2 days ago 11:45 AM',
      title: 'Dispatched from Central Temple Facility',
      desc: `Consignment handed over to ${courier} at ISKCON Durgapur Temple Hub.`,
      color: 'bg-indigo-600'
    });
  }
  if (step >= 2) {
    scans.push({
      time: '3 days ago 05:00 PM',
      title: 'Altar Sanctified & Sealed',
      desc: 'Maha-Prasadam peda, Bhagavad-gita and Tulasi mala placed in moisture-barrier container and blessed at Sandhya Arati.',
      color: 'bg-amber-600'
    });
  }
  scans.push({
    time: '4 days ago 10:00 AM',
    title: 'Appearance Day Requisition Approved',
    desc: 'Congregation dispatch office generated celebration dispatch manifest.',
    color: 'bg-slate-400'
  });

  container.innerHTML = scans.map(s => `
    <div class="relative pl-4 pb-2">
      <div class="absolute -left-[21px] top-1 w-3 h-3 rounded-full ${s.color} border-2 border-white shadow"></div>
      <div class="flex items-center justify-between">
        <span class="font-bold text-slate-900">${s.title}</span>
        <span class="text-[10px] text-slate-400">${s.time}</span>
      </div>
      <p class="text-slate-600 mt-0.5 leading-relaxed text-[11px]">${s.desc}</p>
    </div>
  `).join('');
}

function closeParcelTrackerModal() {
  document.getElementById('parcel-tracker-modal').classList.add('hidden');
}

function copyTrackingId() {
  if (activeTrackingDevotee) {
    copyToClipboard(activeTrackingDevotee.courierTrackingNo || activeTrackingDevotee.trackingId || '', 'Tracking number copied to clipboard!');
  }
}

function updateParcelStatusDirect(newStatus) {
  if (!activeTrackingDevotee) return;
  activeTrackingDevotee.parcelStatus = newStatus;
  
  if (newStatus === 'DELIVERED') {
    activeTrackingDevotee.parcelStatusText = 'Delivered & Blessed';
    activeTrackingDevotee.deliveryDate = new Date().toISOString().split('T')[0];
  } else if (newStatus === 'OUT_FOR_DELIVERY') {
    activeTrackingDevotee.parcelStatusText = 'Out for Delivery';
  } else if (newStatus === 'IN_TRANSIT') {
    activeTrackingDevotee.parcelStatusText = 'Dispatched - In Transit';
  } else if (newStatus === 'PACKED_BLESSED') {
    activeTrackingDevotee.parcelStatusText = 'Prasadam Sanctified & Packed';
  } else {
    activeTrackingDevotee.parcelStatusText = 'Order Approved';
  }

  // Auto-sync the new status into the live parcel record (Parcel Tracking)
  const syncRec = (state.parcels || []).find(p => p.devoteeId === activeTrackingDevotee.id);
  if (syncRec) {
    syncRec.parcelStatus = activeTrackingDevotee.parcelStatus;
    syncRec.parcelStatusText = activeTrackingDevotee.parcelStatusText;
    if (activeTrackingDevotee.deliveryDate) syncRec.deliveryDate = activeTrackingDevotee.deliveryDate;
  }

  saveToStorage();
  logActivity('edit', 'Parcel', `Status for "${activeTrackingDevotee.spiritualName || activeTrackingDevotee.legalName || 'devotee'}" set to ${activeTrackingDevotee.parcelStatusText}.`, activeTrackingDevotee.id);
  updateKPIs();
  renderParcelsTable();
  renderBirthdaysGrid();
  openParcelTrackerModal(activeTrackingDevotee.id);
  showToast(`Updated status to "${activeTrackingDevotee.parcelStatusText}"!`, 'success');
}

function openShippingLabelModal(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  const displayName = d.legalName || d.spiritualName;
  const spiritualName = d.spiritualName || '';
  const trackingId = d.trackingId || `ISK713204-${String(d.slNo || 1).padStart(3, '0')}`;
  const pin = d.pincode || '713204';
  const deliveryModeLabel = getParcelDeliveryModeLabel({ devoteeId: d.id, deliveryMode: d.deliveryMode, courierPartner: d.courierPartner });

  const slHeader = document.getElementById('sl-courier-header');
  if (slHeader) {
    slHeader.innerText = deliveryModeLabel.toUpperCase();
    slHeader.className = 'text-[11px] font-black block text-red-600 tracking-wider';
  }
  document.getElementById('sl-tracking-barcode').innerText = d.courierTrackingNo || trackingId;
  document.getElementById('sl-hub-code').innerText = `WB-DGP-${pin.substring(0, 3)}-01`;
  document.getElementById('sl-recipient-name').innerText = displayName.toUpperCase();
  document.getElementById('sl-spiritual-name').innerText = spiritualName.toUpperCase();
  document.getElementById('sl-recipient-address').innerText = (d.address || 'ICHAPUR, PASCHIM BARDHAMAN').toUpperCase();
  document.getElementById('sl-recipient-phone').innerText = d.phone || '8170081544';
  document.getElementById('sl-recipient-pin').innerText = `${pin.substring(0, 3)} ${pin.substring(3)}`;

  document.getElementById('shipping-label-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeShippingLabelModal() {
  document.getElementById('shipping-label-modal').classList.add('hidden');
}

function printShippingLabelFromTracker() {
  if (activeTrackingDevotee) {
    openShippingLabelModal(activeTrackingDevotee.id);
  }
}

function batchPrintShippingLabels() {
  window.print();
}

function exportParcelReportPDF() {
  const parcels = state.parcels || [];
  if (parcels.length === 0) {
    showToast('No parcels to export yet — create parcels from the Birthday / Anniversary lists.', 'info');
    return;
  }

  // Same filter pipeline as the on-screen tracking table, so the PDF matches
  // exactly what the user is looking at (Mode of Delivery / Purpose / Search).
  const modeFilter = document.getElementById('parcel-filter-mode') ? document.getElementById('parcel-filter-mode').value : 'ALL';
  const purposeFilter = document.getElementById('parcel-filter-purpose') ? document.getElementById('parcel-filter-purpose').value : 'ALL';
  const search = document.getElementById('parcel-filter-search') ? document.getElementById('parcel-filter-search').value.toLowerCase().trim() : '';

  const filtered = parcels.filter(p => {
    if (modeFilter !== 'ALL' && getParcelDeliveryModeLabel(p) !== modeFilter) return false;
    if (purposeFilter !== 'ALL') {
      const purpose = p.parcelType || p.eventType || '';
      if (purpose !== purposeFilter) return false;
    }
    if (search) {
      const trk = (p.courierTrackingNo || p.trackingId || '').toLowerCase();
      const sName = (p.spiritualName || '').toLowerCase();
      const lName = (p.legalName || '').toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      const city = (p.city || '').toLowerCase();
      const pin = (p.pincode || '').toLowerCase();
      const id = (p.devoteeId || '').toLowerCase();
      if (!trk.includes(search) && !sName.includes(search) && !lName.includes(search) && !phone.includes(search) && !city.includes(search) && !pin.includes(search) && !id.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => {
    const ta = a.createdAt || a.bookingDate || a.parcelCreatedAt || '';
    const tb = b.createdAt || b.bookingDate || b.parcelCreatedAt || '';
    if (ta && tb) return new Date(tb) - new Date(ta);
    return 0;
  });

  if (filtered.length === 0) {
    showToast('No parcels match the current filters.', 'info');
    return;
  }

  const trHtml = filtered.map((p, i) => {
    const d = state.devotees.find(x => x.id === p.devoteeId) || {};
    const displayName = p.spiritualName || p.legalName || d.spiritualName || d.legalName || '—';
    const legal = (p.spiritualName || d.spiritualName) ? (p.legalName || d.legalName || '') : '';
    const phone = p.phone || d.phone || '—';
    const purpose = p.parcelType || p.eventType || (d.birthdayRaw ? 'Birthday' : 'Anniversary') || '—';
    const mode = getParcelDeliveryModeLabel(p);
    const trk = p.courierTrackingNo || '—';
    const isSelf = mode === 'Self Mode';
    const pre = p.preCalling || (isSelf ? 'Yes' : '—');
    const post = p.postCalling || (isSelf ? 'No' : '—');
    const delivered = p.delivered === true;
    const status = delivered ? 'Delivered' : 'Not Delivered';
    return `<tr>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px">${i + 1}</td>
      <td style="text-align:left;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px">${escapeHtml(displayName)}${legal ? `<div style="color:#64748b;font-size:9px">${escapeHtml(legal)} • ${escapeHtml(phone)}</div>` : `<div style="color:#64748b;font-size:9px">${escapeHtml(phone)}</div>`}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px">${escapeHtml(purpose)}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px;white-space:nowrap">${isSelf ? '🏠 Self Mode' : '🚚 Delhivery Courier'}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px;font-family:monospace;white-space:nowrap;color:${isSelf ? '#b91c1c' : '#1e293b'}">${isSelf ? 'Locked 🔒' : escapeHtml(trk)}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px;white-space:nowrap;color:${pre === 'Yes' ? '#047857' : '#64748b'};font-weight:${pre === 'Yes' ? '700' : '400'}">${escapeHtml(pre)}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px;white-space:nowrap;color:${post === 'No' ? '#b91c1c' : '#64748b'};font-weight:${post === 'No' ? '700' : '400'}">${escapeHtml(post)}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:5px 7px;font-size:10px;white-space:nowrap;color:${delivered ? '#047857' : '#b91c1c'};font-weight:700">${delivered ? '🟢 Delivered' : '🔴 Not Delivered'}</td>
    </tr>`;
  }).join('');

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const deliveredCount = filtered.filter(p => p.delivered === true).length;
  const selfCount = filtered.filter(p => getParcelDeliveryModeLabel(p) === 'Self Mode').length;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ISKCON Durgapur - Parcel & Tracking Report</title>
  <style>
    @page { size: A4 landscape; margin: 9mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 12px; color: #1e293b; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-box { border-bottom: 2px solid #075985; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
    .org-title { font-size: 17px; font-weight: 800; color: #075985; margin: 0 0 3px 0; }
    .sub-title { font-size: 11px; color: #64748b; margin: 0; }
    .meta-box { text-align: right; font-size: 10.5px; color: #334155; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
    .footer { margin-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <p class="org-title">ISKCON Durgapur — Devotee Care • Parcel &amp; Tracking Report</p>
      <p class="sub-title">Logistics Hub: Sri Sri Radha Madan Mohan Mandir, Durgapur</p>
    </div>
    <div class="meta-box">
      <div>Generated: ${dateStr}</div>
      <div>Consignments: <strong>${filtered.length}</strong> • Delivered: <strong>${deliveredCount}</strong> • Self Mode: <strong>${selfCount}</strong></div>
    </div>
  </div>
  <table border="0" cellspacing="0" cellpadding="0">
    <thead>
      <tr>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">S.No.</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Recipient</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Purpose</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Mode of Delivery</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Tracking No.</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Pre Calling</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Post Calling</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Status</th>
      </tr>
    </thead>
    <tbody>${trHtml}</tbody>
  </table>
  <div class="footer">Sri Sri Radha Madan Mohan Mandir, ISKCON Durgapur — For internal seva coordination only.</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    showToast('Please allow pop-ups for this portal.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) {} }, 350);
  showToast(`Parcel & Tracking Report opened for PDF export (${filtered.length} consignments).`, 'success');
}

// ----------------------------------------------------
// GREETING CARD (Disabled as requested)
// ----------------------------------------------------
function openGreetingCardModal() {}
function openGenericGreetingCard() {}
function closeGreetingCardModal() {}
function copyGreetingCardText() {}
function shareGreetingCardWhatsApp() {}
function downloadGreetingCardPNG() {}


// ----------------------------------------------------
// ADDRESS VERIFICATION & EDIT MODAL
// ----------------------------------------------------
function launchAddressVerifyWhatsApp() {
  if (!activeTrackingDevotee) return;
  sendAddressVerificationWhatsApp(activeTrackingDevotee.id);
}

function sendAddressVerificationWhatsApp(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  const phone = (d.whatsapp || d.phone || '').replace(/[^\d]/g, '');
  const name = d.spiritualName || d.legalName;
  const currentAddr = d.address || 'Address on file';
  const pin = d.pincode || 'Not on file';

  const text = `Hare Krishna ${name} Prabhu/Mataji! 🙏\n\nPlease accept our humble obeisances. All glories to Srila Prabhupada! 🪷\n\nThis is the ISKCON Devotee Logistics Department. We are preparing to dispatch your auspicious Appearance Day Maha-Prasadam & Gift Package! 🎁📦\n\nKindly verify or update your current postal delivery address:\n\n📍 Address: ${currentAddr}\n📮 PIN Code: ${pin}\n📞 Contact Phone: ${d.phone}\n\nIf any update is needed, please reply to this message with your complete home address, landmark, and 6-digit PIN code. Thank you so much!\n\nYour servants,\nISKCON Devotee Logistics Department`;

  const cleanNum = phone.startsWith('91') ? phone : `91${phone}`;
  window.open(`https://wa.me/${cleanNum}?text=${encodeURIComponent(text)}`, '_blank');
}

// Mode of Delivery change in the Edit Parcel modal — Self Mode locks the tracking
// number (not required) and forces Post Calling OFF automatically. Pre Calling is
// now user-editable for every parcel (lock removed).
function handleEditParcelModeChange() {
  const modeEl = document.getElementById('ep-mode');
  if (!modeEl) return;
  const isSelf = modeEl.value === 'Self Mode';
  const trk = document.getElementById('ep-tracking-no');
  const hint = document.getElementById('ep-tracking-hint');
  if (trk) {
    trk.disabled = isSelf;
    trk.classList.toggle('bg-slate-100', isSelf);
    trk.classList.toggle('cursor-not-allowed', isSelf);
    if (isSelf) trk.value = '';
  }
  if (hint) {
    hint.innerText = isSelf ? '🔒 Locked — Self Mode (temple pickup), no tracking needed' : '(13-14 digits required)';
    hint.classList.toggle('text-amber-600', isSelf);
    hint.classList.toggle('text-slate-500', !isSelf);
  }
  // Pre Calling: always editable. Post Calling: locked OFF for Self Mode only.
  const preTgl = document.querySelector('div[data-input="ep-pre-calling"]');
  if (preTgl) preTgl.querySelectorAll('button').forEach(b => { b.disabled = false; });
  const postTgl = document.querySelector('div[data-input="ep-post-calling"]');
  if (postTgl) postTgl.querySelectorAll('button').forEach(b => { b.disabled = isSelf; });
  if (isSelf) {
    setCallingToggleValue('ep-post-calling', 'No');
  }
}

function openEditParcelModal(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;
  const pRec = (state.parcels || []).find(x => x.devoteeId === devoteeId) || {};

  document.getElementById('ep-devotee-id').value = d.id;
  document.getElementById('ep-name').value = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
  document.getElementById('ep-address').value = pRec.address || d.address || '';
  document.getElementById('ep-city').value = pRec.city || d.city || 'Durgapur';
  document.getElementById('ep-pincode').value = pRec.pincode || d.pincode || '713204';
  document.getElementById('ep-address-verified').value = pRec.addressVerified || d.addressVerified || '';
  const epModeEl = document.getElementById('ep-mode');
  if (epModeEl) {
    const modeLabel = getParcelDeliveryModeLabel({ devoteeId: d.id, deliveryMode: pRec.deliveryMode || d.deliveryMode, courierPartner: pRec.courierPartner || d.courierPartner });
    epModeEl.value = (modeLabel === 'Not Set') ? '' : modeLabel;
  }
  document.getElementById('ep-tracking-no').value = pRec.courierTrackingNo || d.courierTrackingNo || '';
  if (document.getElementById('ep-pre-calling')) {
    setCallingToggleValue('ep-pre-calling', pRec.preCalling || d.preCalling || '');
  }
  if (document.getElementById('ep-post-calling')) {
    setCallingToggleValue('ep-post-calling', pRec.postCalling || d.postCalling || '');
  }

  // Apply Mode of Delivery UI state LAST — Self Mode locks the tracking input,
  // shows the amber hint and forces Pre Calling ON / Post Calling OFF.
  handleEditParcelModeChange();

  document.getElementById('edit-parcel-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeEditParcelModal() {
  document.getElementById('edit-parcel-modal').classList.add('hidden');
}

function handleSaveParcelEdit(e) {
  e.preventDefault();
  const id = document.getElementById('ep-devotee-id').value;
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;

  const epModeVal = document.getElementById('ep-mode') ? document.getElementById('ep-mode').value : '';
  if (!epModeVal) {
    showToast('Please select Mode of Delivery (Delhivery Courier or Self Mode)', 'error');
    document.getElementById('ep-mode')?.focus();
    return;
  }

  d.address = document.getElementById('ep-address').value.trim();
  d.city = document.getElementById('ep-city').value.trim();
  d.pincode = document.getElementById('ep-pincode').value.trim();
  d.addressVerified = document.getElementById('ep-address-verified').value;
  d.courierPartner = (epModeVal === 'Self Mode') ? 'Self Pickup' : 'Delhivery';
  d.deliveryMode = (epModeVal === 'Self Mode') ? 'SELF' : 'DELHIVERY';

  const isSelfMode = epModeVal === 'Self Mode';
  const rawTrk = document.getElementById('ep-tracking-no') ? document.getElementById('ep-tracking-no').value.trim() : '';
  const cleanTrk = rawTrk.replace(/\D/g, '');

  if (isSelfMode) {
    // Self Mode (temple pickup) — tracking locked & not required; Post Calling stays OFF
    // (Self Mode rule). Pre Calling is user-editable (lock removed) — read the modal value.
    d.courierTrackingNo = '';
    d.postCalling = 'No';
    const preVal = document.getElementById('ep-pre-calling') ? document.getElementById('ep-pre-calling').value : '';
    d.preCalling = preVal || d.preCalling || 'Yes';
  } else {
    if (!cleanTrk) {
      showToast('Tracking Number is mandatory (*) — please enter the 13-14 digit number', 'error');
      document.getElementById('ep-tracking-no')?.focus();
      return;
    }

    if (!/^\d{13,14}$/.test(cleanTrk)) {
      showToast(`Tracking Number must be 13-14 digits (currently ${cleanTrk.length} digits entered)`, 'error');
      document.getElementById('ep-tracking-no')?.focus();
      return;
    }

    d.courierTrackingNo = cleanTrk.slice(0, 14);
    d.preCalling = document.getElementById('ep-pre-calling') ? document.getElementById('ep-pre-calling').value : d.preCalling;
    d.postCalling = document.getElementById('ep-post-calling') ? document.getElementById('ep-post-calling').value : d.postCalling;
  }

  // Sync the edited details into the live parcel record too
  const pRec = (state.parcels || []).find(x => x.devoteeId === id);
  if (pRec) {
    pRec.address = d.address;
    pRec.city = d.city;
    pRec.pincode = d.pincode;
    pRec.addressVerified = d.addressVerified;
    pRec.courierPartner = d.courierPartner;
    pRec.deliveryMode = d.deliveryMode;
    pRec.courierTrackingNo = d.courierTrackingNo;
    pRec.preCalling = d.preCalling;
    pRec.postCalling = d.postCalling;
  }

  saveToStorage();
  updateKPIs();
  renderParcelsTable();
  renderBirthdaysGrid();
  closeEditParcelModal();
  showToast('Consignment and address details updated successfully!', 'success');
}

// ----------------------------------------------------
// ADDRESS VERIFICATION SYSTEM
// ----------------------------------------------------
function toggleAddressVerification(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  const displayName = d.spiritualName || d.legalName;
  const isCurrentlyVerified = isDevoteAddressVerified(d);

  if (isCurrentlyVerified) {
    d.addressVerified = 'Needs Verification';
    showToast(`Address for ${displayName} marked as ❌ Not Verified`, 'info');
  } else {
    d.addressVerified = 'Verified';
    showToast(`Address for ${displayName} marked as ✅ Verified!`, 'success');
  }

  saveToStorage();
  updateKPIs();
  renderBirthdaysGrid();
  renderDevoteesTable();
  renderParcelsTable();
}

function openVerifyAddressModal(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  const displayName = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
  document.getElementById('va-devotee-id').value = d.id;
  document.getElementById('va-name').innerText = displayName;
  document.getElementById('va-phone').innerText = d.phone || 'N/A';
  document.getElementById('va-address').value = d.address || '';
  document.getElementById('va-city').value = d.city || 'Durgapur';
  document.getElementById('va-pincode').value = d.pincode || '713204';

  document.getElementById('verify-address-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeVerifyAddressModal() {
  document.getElementById('verify-address-modal').classList.add('hidden');
}

function handleSaveAddressVerification(e) {
  e.preventDefault();
  const id = document.getElementById('va-devotee-id').value;
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;

  d.address = document.getElementById('va-address').value.trim();
  d.city = document.getElementById('va-city').value.trim();
  d.pincode = document.getElementById('va-pincode').value.trim();
  d.addressVerified = 'Verified';

  saveToStorage();
  updateKPIs();
  renderBirthdaysGrid();
  renderDevoteesTable();
  renderParcelsTable();
  refreshProfileAddressView(id); // flip the profile badge 🔴 → 🟢 immediately
  syncDevoteeRecordToCloud(d);   // best-effort cloud mirror
  closeVerifyAddressModal();
  showToast(`Address for ${d.spiritualName || d.legalName} updated and marked as ✅ Verified!`, 'success');
}

// Live-refresh the View Profile modal's address line + 🟢/🔴 badge after any
// address save — the Profile never keeps a stale copy of the Directory record.
function refreshProfileAddressView(id) {
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;
  const addrEl = document.getElementById('vp-address');
  if (addrEl) addrEl.innerText = (d.address ? d.address : 'No address recorded') + (d.pincode ? ' - ' + d.pincode : '');
  const badgeEl = document.getElementById('vp-address-verify');
  if (badgeEl) {
    if (isDevoteAddressVerified(d)) {
      badgeEl.innerHTML = '<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><span>🟢</span><span>Verified</span></span>';
    } else if (d.addressVerified) {
      badgeEl.innerHTML = '<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300"><span>🔴</span><span>Unverified</span></span>';
    } else {
      badgeEl.innerHTML = '<span class="text-slate-400 text-xs italic">—</span>';
    }
  }
}

// Centralized Database: Push ONE Directory record to Supabase
async function syncDevoteeRecordToCloud(d) {
  const client = getSupabaseClient();
  if (!client || !d) return;
  try {
    const row = {
      'SL NO': d.slNo || 0,
      'DEVOTEE ID': d.id || '',
      'NAME': d.legalName || '',
      'INITIATED NAME': d.spiritualName || '',
      'SPOUSE NAME': d.spouseName || '',
      'BIRTHDAY': d.birthdayRaw || '',
      'ANNIVERSARY': d.anniversaryRaw || '',
      'CONTACT NO': d.phone || '',
      'ADDRESS': d.address || '',
      'CITY': d.city || '',
      'STATE': d.state || '',
      'PIN CODE': d.pincode || '',
      'PHOTO': d.photo || '',
      'marital_status': d.maritalStatus || null,
      'address_verified': d.addressVerified || null,
      'delivery_mode': d.deliveryMode || null,
      'courier_partner': d.courierPartner || null
    };

    // Try update first by DEVOTEE ID
    let { data, error } = await client
      .from('devotees')
      .update(row)
      .eq('DEVOTEE ID', d.id)
      .select();

    // If record did not exist in cloud, insert/upsert it
    if (!error && Array.isArray(data) && data.length === 0) {
      const insRes = await client.from('devotees').upsert([row], { onConflict: 'DEVOTEE ID' });
      error = insRes.error;
    }

    if (error) {
      console.warn('☁️ Devotee cloud sync notice:', error.message);
    } else {
      console.log('✅ Devotee record synced to Supabase Central Database:', d.id);
    }
  } catch (e) {
    console.warn('Devotee cloud sync exception:', e);
  }
}

// ----------------------------------------------------
// EDIT DEVOTEE ADDRESS (Dedicated Address Editor)
// ----------------------------------------------------
function openEditAddressModal(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  const displayName = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
  document.getElementById('ea-devotee-id').value = d.id;
  document.getElementById('ea-name').innerText = displayName;
  document.getElementById('ea-phone').innerText = d.phone || 'N/A';
  document.getElementById('ea-address').value = d.address || '';
  document.getElementById('ea-city').value = d.city || 'Durgapur';
  document.getElementById('ea-pincode').value = d.pincode || '713204';

  document.getElementById('edit-address-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeEditAddressModal() {
  document.getElementById('edit-address-modal').classList.add('hidden');
}

function handleSaveAddressEdit(e) {
  e.preventDefault();
  const id = document.getElementById('ea-devotee-id').value;
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;

  d.address = document.getElementById('ea-address').value.trim();
  d.city = document.getElementById('ea-city').value.trim();
  d.pincode = document.getElementById('ea-pincode').value.trim();
  // Preserve existing verification state (do not force Verified)

  saveToStorage();
  updateKPIs();
  renderBirthdaysGrid();
  renderDevoteesTable();
  renderParcelsTable();
  refreshProfileAddressView(id); // the open View Profile modal updates instantly — no stale copy
  syncDevoteeRecordToCloud(d);   // best-effort cloud mirror
  closeEditAddressModal();
  showToast(`Address for ${d.spiritualName || d.legalName} updated successfully!`, 'success');
}

// ----------------------------------------------------
// DIRECT CREATE PARCEL WORKFLOW SYSTEM
// ----------------------------------------------------
function openCreateParcelModal(devoteeId, parcelTypeOverride = null) {
  const selectContainer = document.getElementById('cp-devotee-select-container');
  const selectEl = document.getElementById('cp-devotee-select');

  let d = null;
  if (devoteeId) {
    d = state.devotees.find(x => x.id === devoteeId);
    if (selectContainer) selectContainer.classList.add('hidden');
  } else {
    // Show select dropdown to pick devotee
    if (selectContainer && selectEl) {
      selectContainer.classList.remove('hidden');
      selectEl.innerHTML = state.devotees.map(dev => `
        <option value="${dev.id}">${dev.spiritualName ? `${dev.spiritualName} (${dev.legalName})` : dev.legalName} [${dev.id}] - ${dev.city || 'Durgapur'}</option>
      `).join('');
      if (state.devotees.length > 0) {
        d = state.devotees[0];
        selectEl.value = d.id;
      }
    }
  }

  if (!d) {
    showToast('Please select or specify a devotee record', 'error');
    return;
  }

  populateCreateParcelFields(d, parcelTypeOverride);
  document.getElementById('create-parcel-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function handleCreateParcelDevoteeSelect(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (d) {
    populateCreateParcelFields(d);
  }
}

function populateCreateParcelFields(d, parcelTypeOverride = null) {
  const matched = findMatchedSpouseDevotee(d);
  let displayName = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
  const isAnniv = parcelTypeOverride === 'Anniversary' || (!parcelTypeOverride && d.parcelType === 'Anniversary');
  if (matched && isAnniv) {
    const sName = matched.spiritualName ? `${matched.spiritualName} (${matched.legalName})` : matched.legalName;
    displayName = `${displayName} & ${sName}`;
  }

  document.getElementById('cp-devotee-id').value = d.id;
  document.getElementById('cp-devotee-id-display').innerText = d.id;
  document.getElementById('cp-devotee-name').value = displayName;
  document.getElementById('cp-phone').value = d.phone || (matched && matched.phone) || 'N/A';

  // Address
  document.getElementById('cp-address').value = d.address || (matched && matched.address) || '';
  document.getElementById('cp-city').value = d.city || (matched && matched.city) || 'Durgapur';
  document.getElementById('cp-pincode').value = d.pincode || (matched && matched.pincode) || '713204';

  // Address Verified Badge
  const addrBadge = document.getElementById('cp-address-verified-badge');
  if (addrBadge) {
    if (isDevoteAddressVerified(d)) {
      addrBadge.className = 'inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
      addrBadge.innerHTML = '<span>✅</span> <span>Verified Address</span>';
    } else {
      addrBadge.className = 'inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300';
      addrBadge.innerHTML = '<span>⚠️</span> <span>Not Verified - update from Devotee Directory</span>';
    }
  }

  // Parcel Type — auto-defaults from launch context (Birthday / Anniversary tab) when provided;
  // otherwise keeps the devotee's existing parcel type (falling back to Birthday).
  const parcelTypeEl = document.getElementById('cp-parcel-type');
  if (parcelTypeEl) {
    parcelTypeEl.value = parcelTypeOverride || d.parcelType || 'Birthday';
  }

  // Parcel Description
  const parcelDescEl = document.getElementById('cp-parcel-description');
  if (parcelDescEl) {
    parcelDescEl.value = d.parcelDescription || 'Sanctified Sri Sri Radha Madan Mohan Maha-Prasadam Laddu, Tulasi Leaves, Sacred Kalash Blessings & Srimad Bhagavad-gita';
  }

  // Mode of Delivery — pre-select devotee's deliveryMode if already chosen, otherwise prompt to choose
  const modeEl = document.getElementById('cp-mode');
  if (modeEl) {
    if (d.deliveryMode === 'SELF') {
      modeEl.value = 'Self Mode';
    } else if (d.deliveryMode === 'DELHIVERY') {
      modeEl.value = 'Delhivery Courier';
    } else {
      modeEl.value = '';
    }
  }

  // Booking Date (Today)
  const bookingEl = document.getElementById('cp-booking-date');
  if (bookingEl) {
    const todayStr = new Date().toISOString().split('T')[0];
    bookingEl.value = d.bookingDate || todayStr;
  }

  // Remarks
  const remarksEl = document.getElementById('cp-remarks');
  if (remarksEl) {
    remarksEl.value = d.remarks || 'Handle with utmost care, sacred deity offering. Call devotee before delivery.';
  }
}

function closeCreateParcelModal() {
  document.getElementById('create-parcel-modal').classList.add('hidden');
}

function handleCreateParcelSubmit(e) {
  e.preventDefault();
  const devoteeId = document.getElementById('cp-devotee-id').value;
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) {
    showToast('Devotee record not found', 'error');
    return;
  }

  const address = document.getElementById('cp-address').value.trim();
  const city = document.getElementById('cp-city').value.trim();
  const pincode = document.getElementById('cp-pincode').value.trim();
  const parcelType = document.getElementById('cp-parcel-type').value;
  const parcelDescription = document.getElementById('cp-parcel-description').value.trim();
  const cpMode = document.getElementById('cp-mode') ? document.getElementById('cp-mode').value : '';
  if (!cpMode) {
    showToast('Please select Mode of Delivery (Delhivery Courier or Self Mode)', 'error');
    document.getElementById('cp-mode')?.focus();
    return;
  }
  const parcelCourier = (cpMode === 'Self Mode') ? 'Self Pickup' : 'Delhivery';
  const bookingDate = document.getElementById('cp-booking-date').value;
  // Compute expected delivery (booking + 4 days) for tracking banner
  let expectedDeliveryDate = '';
  if (bookingDate) {
    const exp = new Date(bookingDate);
    exp.setDate(exp.getDate() + 4);
    expectedDeliveryDate = exp.toISOString().split('T')[0];
  }
  const remarks = document.getElementById('cp-remarks').value.trim();

  // Update devotee record with verified address and consignment details.
  // NOTE: Tracking Number + Pre/Post Calling are NOT part of this create form —
  // they are managed from the Parcel & Tracking (Delivery Tracking System) tab.
  d.address = address;
  d.city = city;
  d.pincode = pincode;
  d.parcelCreated = true;
  d.hasParcel = true;
  d.parcelCreatedAt = new Date().toISOString();
  d.parcelType = parcelType;
  d.parcelDescription = parcelDescription;
  d.courierPartner = parcelCourier;
  d.deliveryMode = (cpMode === 'Self Mode') ? 'SELF' : 'DELHIVERY';
  if (cpMode === 'Self Mode') { d.preCalling = 'Yes'; d.postCalling = 'No'; } // Self Mode: Pre ON, Post OFF
  d.bookingDate = bookingDate;
  d.expectedDeliveryDate = expectedDeliveryDate;
  d.remarks = remarks;

  // Manage in state.parcels array as well
  if (!state.parcels) state.parcels = [];
  const devNameInput = document.getElementById('cp-devotee-name')?.value;
  const parcelRecord = {
    id: `PARCEL-${d.id}-${Date.now()}`,
    devoteeId: d.id,
    devoteeName: devNameInput || d.spiritualName || d.legalName,
    spiritualName: d.spiritualName || '',
    legalName: d.legalName || '',
    phone: d.phone,
    address: d.address,
    city: d.city,
    pincode: d.pincode,
    addressVerified: d.addressVerified || '',
    dob: d.dob,
    birthdayRaw: d.birthdayRaw,
    anniversaryDate: d.anniversaryDate,
    parcelType: parcelType,
    parcelDescription: parcelDescription,
    courierPartner: parcelCourier,
    courierTrackingNo: d.courierTrackingNo || '',
    trackingId: d.trackingId || '',
    bookingDate: bookingDate,
    expectedDeliveryDate: expectedDeliveryDate,
    delivered: false,
    deliveredAt: '',
    preCalling: d.preCalling || '',
    postCalling: d.postCalling || '',
    remarks: remarks,
    createdAt: new Date().toISOString()
  };

  const pIdx = state.parcels.findIndex(p => p.devoteeId === d.id);
  if (pIdx >= 0) {
    state.parcels[pIdx] = parcelRecord;
  } else {
    state.parcels.unshift(parcelRecord);
  }

  // Persist to storage
  saveToStorage();
  logActivity('create', 'Parcel', `Created parcel for "${d.spiritualName || d.legalName}" (${parcelType}).`, parcelRecord.id);
  updateKPIs();
  renderBirthdaysGrid();
  renderDevoteesTable();

  // Reset search filter in Parcel Tracking so the new parcel is immediately visible
  const parcelSearch = document.getElementById('parcel-filter-search');
  if (parcelSearch) parcelSearch.value = '';

  renderParcelsTable();
  closeCreateParcelModal();

  const devoteeName = d.spiritualName || d.legalName;
  showToast(`📦 Parcel created successfully for ${devoteeName}! Transferred directly to Parcel & Tracking.`, 'success');

  // Automatic Workflow: Switch directly to Parcel & Tracking view
  switchTab('parcels');

  // Smooth scroll and highlight the new parcel row
  setTimeout(() => {
    const row = document.getElementById(`parcel-row-${parcelRecord.id}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('bg-amber-100/80', 'ring-2', 'ring-amber-400');
      setTimeout(() => {
        row.classList.remove('bg-amber-100/80', 'ring-2', 'ring-amber-400');
      }, 3500);
    }
  }, 350);
}

function callDeliveryAssociate() {
  if (activeTrackingDevotee && activeTrackingDevotee.phone) {
    window.open('tel:+919434100212');
  }
}

function copyToClipboard(text, msg = 'Copied to clipboard!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(msg, 'success'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(msg, 'success');
  }
}

function syncMasterDevotees() {
  if (typeof DURGAPUR_DEVOTEES !== 'undefined' && Array.isArray(DURGAPUR_DEVOTEES)) {
    state.devotees = DURGAPUR_DEVOTEES;
    saveToStorage();
    logActivity('sync', 'Database', `Synced all ${state.devotees.length} master devotee records.`);
    initApp();
    showToast(`Successfully synced all ${state.devotees.length} master devotees!`, 'success');
  }
}

// ----------------------------------------------------
// WHATSAPP WISHES GENERATOR MODAL
// ----------------------------------------------------
let activeWishesDevotee = null;
let activeCelebrationType = 'birthday';

function openWishesModal(devoteeId, eventType = 'birthday') {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  activeWishesDevotee = d;
  activeCelebrationType = eventType;
  const name = d.spiritualName || d.legalName;
  const matched = (eventType === 'marriage') ? findMatchedSpouseDevotee(d) : null;

  if (matched) {
    const spouseName = matched.spiritualName || matched.legalName;
    const p1 = d.whatsapp || d.phone || '';
    const p2 = matched.whatsapp || matched.phone || '';
    const phoneStr = [p1, p2].filter(Boolean).join(' / ');
    document.getElementById('wm-recipient').value = `${name} & ${spouseName} (${phoneStr || 'No phone'})`;
  } else {
    document.getElementById('wm-recipient').value = `${name} (${d.whatsapp || d.phone || 'No phone'})`;
  }

  const select = document.getElementById('wm-template-type');
  if (select) {
    if (eventType === 'marriage') select.value = 'marriage';
    else if (eventType === 'initiation') select.value = 'initiation';
    else select.value = 'birthday';
  }

  updateGreetingTemplate();
  document.getElementById('wishes-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeWishesModal() {
  document.getElementById('wishes-modal').classList.add('hidden');
}

function updateGreetingTemplate() {
  if (!activeWishesDevotee) return;
  const d = activeWishesDevotee;
  const name = d.spiritualName || d.legalName;
  const style = document.getElementById('wm-template-type').value;

  let msg = '';
  if (style === 'birthday') {
    msg = `Hare Krishna ${name}! 🙏\n\nPlease accept our humble obeisances. All glories to Srila Prabhupada! 🪷\n\nOn behalf of the ISKCON Devotee Celebrations Department, we wish you a very auspicious and blessed Appearance Day (Birthday)! 🎉\n\nMay Sri Sri Radha-Madhava, Sri Sri Jagannatha, Baladeva, Subhadra Maharani, and Srila Prabhupada shower Their supreme mercy upon you with excellent health, long life, and endless taste for chanting the Holy Names:\n\nHare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare ✨\n\nThank you for your sincere devotional service to the Vaishnavas.\n\nYour servants,\nISKCON Devotee Celebrations Department`;
  } else if (style === 'marriage') {
    const matched = findMatchedSpouseDevotee(d);
    const spouse = matched 
      ? ` & ${matched.spiritualName || matched.legalName}`
      : (d.spouseName ? ` & ${d.spouseName}` : '');
    msg = `Hare Krishna ${name}${spouse}! 🙏\n\nPlease accept our humble obeisances. All glories to Srila Prabhupada! 🪷\n\nOn this auspicious occasion of your Grihastha Vivaha (Marriage) Anniversary, we pray to Sri Sri Radha-Madhava and Sri Sri Gaura-Nitai to bless your family with joy, peace, harmony, and eternal progress in Krishna consciousness! 💍✨\n\nMay your home always remain an abode of Harinama sankirtana, deity seva, and Vaishnava seva.\n\nHappy Marriage Anniversary! 🙏\n\nYour servants,\nISKCON Devotee Celebrations Department`;
  } else if (style === 'initiation') {
    const guru = d.guru ? `your Spiritual Master ${d.guru}` : 'your Spiritual Master and Guru Parampara';
    msg = `Hare Krishna ${name}! 🙏\n\nPlease accept our humble obeisances. All glories to Srila Prabhupada! 🪷\n\nHeartiest congratulations on your auspicious Diksa / Initiation Anniversary! May you continue to receive the divine shelter, empowerment, and transcendental blessings of ${guru} in pure devotional service.\n\nHare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare ✨\n\nYour servants in Vaishnava Seva,\nISKCON`;
  } else if (style === 'health') {
    msg = `Hare Krishna ${name}! 🙏\n\nPlease accept our heartfelt prayers and dandavat pranams. All glories to Srila Prabhupada! 🪷\n\nWe are praying to Lord Sri Nrisimhadeva and Sri Radha-Madhava for your speedy recovery, strength, and complete good health. May Krishna always protect and bless you.\n\nHare Krishna!`;
  } else if (style === 'gratitude') {
    msg = `Hare Krishna ${name}! 🙏\n\nDandavat Pranams. All glories to Srila Prabhupada! 🪷\n\nWe want to take a moment to express our deep heartfelt gratitude for your wonderful seva and dedication to our Vaishnava community. Please let us know if there is anything we can do to assist your devotional life.\n\nYour servants,\nISKCON Congregation Department`;
  }

  document.getElementById('wm-message').value = msg;
}

function copyWishesMessage() {
  const text = document.getElementById('wm-message').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Vaishnava message copied to clipboard!', 'success');
  });
}

function launchWhatsAppDirect() {
  if (!activeWishesDevotee) return;
  const matched = (activeCelebrationType === 'marriage') ? findMatchedSpouseDevotee(activeWishesDevotee) : null;
  let phone = (activeWishesDevotee.whatsapp || activeWishesDevotee.phone || '').replace(/[^0-9]/g, '');
  if (!phone && matched) {
    phone = (matched.whatsapp || matched.phone || '').replace(/[^0-9]/g, '');
  }
  const message = encodeURIComponent(document.getElementById('wm-message').value);

  if (!phone) {
    alert('No WhatsApp number provided for this devotee / couple. You can copy the message and send manually.');
    return;
  }

  const url = `https://wa.me/${phone}?text=${message}`;
  window.open(url, '_blank');
}

// ----------------------------------------------------
// EXPORT & IMPORT (EXCEL / JSON)
// ----------------------------------------------------
function downloadJsonBackup() {
  if (!requirePermission('export_data', 'download the full database backup')) return;
  const data = {
    exportDate: new Date().toISOString(),
    version: '1.0',
    devotees: state.devotees,
    counselors: state.counselors
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ISKCON_Master_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Database backup downloaded successfully!', 'success');
}

function restoreJsonBackup(event) {
  if (!requirePermission('manage_settings', 'restore a database backup')) {
    if (event && event.target) event.target.value = ''; // let the user pick another file later
    return;
  }
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.devotees && Array.isArray(parsed.devotees)) {
        state.devotees = parsed.devotees;
        state.counselors = parsed.counselors || [];
        saveToStorage();
        logActivity('import', 'Database', `Restored database from JSON backup (${state.devotees.length} devotees).`);
        initApp();
        showToast('Database successfully restored from JSON backup!', 'success');
      } else {
        alert('Invalid backup file format: Missing devotee records.');
      }
    } catch (err) {
      alert('Error parsing backup file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function exportFullDatabaseExcel() {
  if (!requirePermission('export_data', 'export the full Excel workbook')) return;
  if (!window.XLSX) {
    alert('Excel engine loading. Please check internet connection.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: Devotees
  const devoteeRows = state.devotees.map(d => ({
    'Devotee ID': d.id,
    'Spiritual Name': d.spiritualName,
    'Legal Name': d.legalName,
    'Ashrama': d.ashrama,
    'Gender': d.gender,
    'Date of Birth': d.dob,
    'Anniversary': d.anniversaryRaw || d.anniversaryDate || d.anniversary || '',
    'Age': calculateAge(d.dob),
    'Phone': d.phone,
    'WhatsApp': d.whatsapp,
    'Email': d.email,
    'City': d.city,
    'Address': d.address,
    'Blood Group': d.bloodGroup,
    'Blood Donor': d.isBloodDonor,
    'Diksa Guru': d.guru,
    'Initiation Status': d.initiationStatus,
    '1st Initiation Date': d.initiationDate,
    '2nd Initiation Date': d.brahmanaDate,
    'Counselor': d.counselor,
    'Sangha Group': d.counselorGroup,
    'Current Seva': d.currentSeva,
    'Medical Conditions': d.medicalConditions,
    'Emergency Contact': `${d.emergencyName || ''} - ${d.emergencyPhone || ''}`,
    'Photo Link': d.photo || d.photoDirect || ''
  }));
  const wsDevotees = XLSX.utils.json_to_sheet(devoteeRows);
  XLSX.utils.book_append_sheet(wb, wsDevotees, 'Devotees Directory');

  // Sheet 2: Prasadam Parcel Logistics
  const parcelRows = state.devotees.map(d => ({
    'Devotee ID': d.id,
    'Devotee Name': d.spiritualName || d.legalName,
    'Tracking ID': d.trackingId || '',
    'Mode of Delivery': deriveDeliveryModeLabel(d),
    'Courier Tracking No': d.courierTrackingNo || '',
    'Parcel Status': d.parcelStatusText || '',
    'Destination City': d.city || '',
    'Delivery Address': d.address || '',
    'Phone': d.phone || ''
  }));
  const wsParcels = XLSX.utils.json_to_sheet(parcelRows);
  XLSX.utils.book_append_sheet(wb, wsParcels, 'Prasadam Parcels Logistics');

  // Sheet 3: Celebration & Anniversary Schedule
  const celebrations = getAllCelebrations().sort((a, b) => a.timing.daysRemaining - b.timing.daysRemaining);
  const celRows = celebrations.map(item => ({
    'Event Type': item.label,
    'Devotee Name': item.devotee.spiritualName || item.devotee.legalName,
    'Event Date': item.date,
    'Milestone': item.milestone,
    'Spouse': item.spouse || '',
    'Days Remaining': item.timing.daysRemaining,
    'Phone / WhatsApp': item.devotee.whatsapp || item.devotee.phone
  }));
  const wsCel = XLSX.utils.json_to_sheet(celRows);
  XLSX.utils.book_append_sheet(wb, wsCel, 'Celebration Schedule');

  XLSX.writeFile(wb, `ISKCON_Master_Database_${new Date().toISOString().split('T')[0]}.xlsx`);
  showToast('Exported full database to Excel!', 'success');
}

function exportFilteredDevoteesExcel() {
  exportFullDatabaseExcel();
}

function exportSelectedDevoteesPDF() {
  if (!requirePermission('export_data', 'export the directory as PDF')) return;
  if (!state.selectedDevotees || state.selectedDevotees.size === 0) {
    showToast('Please select at least one record.', 'warning');
    alert('Please select at least one record.');
    return;
  }

  // Get selected devotee records sorted by their Serial Number
  const selectedList = state.devotees
    .filter(d => state.selectedDevotees.has(d.id))
    .sort((a, b) => (parseInt(a.slNo) || 0) - (parseInt(b.slNo) || 0));

  if (selectedList.length === 0) {
    showToast('Please select at least one record.', 'warning');
    alert('Please select at least one record.');
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const slNoSummary = selectedList.map(d => d.slNo || d.id).join(', ');

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ISKCON Devotee Directory - Selected Records</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 12px;
      color: #1e293b;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-box {
      border-bottom: 2px solid #0f766e;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .org-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f766e;
      margin: 0 0 3px 0;
      letter-spacing: -0.3px;
    }
    .sub-title {
      font-size: 11px;
      color: #64748b;
      margin: 0;
    }
    .meta-box {
      text-align: right;
      font-size: 10.5px;
      color: #334155;
      line-height: 1.4;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
      font-weight: 700;
      font-size: 10px;
    }
    .sl-list {
      font-weight: 700;
      color: #0f766e;
      max-width: 340px;
      word-break: break-word;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-top: 4px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #0f766e;
      color: #ffffff;
      padding: 7px 8px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
      text-align: left;
      border: 1px solid #0d6b63;
    }
    th.center, td.center {
      text-align: center;
    }
    td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
      color: #334155;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    .sno-col {
      font-weight: 800;
      font-family: "Courier New", Courier, monospace;
      color: #0f766e;
      font-size: 11px;
    }
    .devotee-main {
      font-weight: 700;
      color: #0f172a;
      font-size: 11px;
    }
    .devotee-sub {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 1px;
    }
    .city-tag {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      background: #f0fdfa;
      color: #115e59;
      border: 1px solid #ccfbf1;
      font-weight: 600;
      font-size: 10px;
    }
    .footer-bar {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 9.5px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <div class="org-title">ISKCON Devotee Directory — Selected Records</div>
      <p class="sub-title">Official Congregation Database • Confidential Vaishnava Dossier</p>
    </div>
    <div class="meta-box">
      <div>Export Date: <strong>${dateStr}</strong></div>
      <div>Selected Count: <span class="badge">${selectedList.length} Devotee(s)</span></div>
      <div>Selected S.No.: <span class="sl-list">${slNoSummary}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width: 45px;">S.No.</th>
        <th style="width: 190px;">Name</th>
        <th style="width: 100px;">Birthday</th>
        <th style="width: 95px;">Anniversary</th>
        <th class="center" style="width: 45px;">Age</th>
        <th style="width: 100px;">Phone</th>
        <th style="width: 110px;">City</th>
        <th>Address</th>
      </tr>
    </thead>
    <tbody>
      ${selectedList.map(d => {
        const displayName = d.spiritualName || d.legalName || 'N/A';
        const secondary = (d.spiritualName && d.legalName) ? d.legalName : '';
        const age = calculateAge(d.dob);
        const bday = d.birthdayRaw || formatDate(d.dob);
        const anniv = d.anniversaryRaw || d.anniversaryDate || d.anniversary || '—';
        const phone = d.phone || 'N/A';
        const city = d.city || 'N/A';
        const addr = (d.address ? d.address : 'No address recorded') + (d.pincode ? ' - ' + d.pincode : '');
        return `
          <tr>
            <td class="center sno-col">${d.slNo || ''}</td>
            <td>
              <div class="devotee-main">${displayName}</div>
              ${secondary ? `<div class="devotee-sub">${secondary}</div>` : ''}
            </td>
            <td>${bday}</td>
            <td>${anniv}</td>
            <td class="center font-bold">${age > 0 ? age + ' yrs' : 'N/A'}</td>
            <td>${phone}</td>
            <td><span class="city-tag">${city}</span></td>
            <td>${addr}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="footer-bar">
    <span>ISKCON Congregation Department • Selected Devotee Directory Record</span>
    <span>Generated automatically via Portal Management System</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 400);
    showToast(`PDF generated for ${selectedList.length} selected record(s).`, 'success');
  } else {
    alert('Popup blocked! Please allow popups to export the PDF.');
  }
}

// Shared "filtered Directory list" resolver — used by the Directory table, CSV export and
// PDF export so every export respects EXACTLY the filters shown on screen
// (search + city + month + age group). One rule, no drift between copies.
function getFilteredDirectoryDevotees() {
  const searchQuery = (document.getElementById('devotee-search')?.value || '').toLowerCase().trim();
  const filterCity = document.getElementById('filter-city')?.value || '';
  const filterMonth = document.getElementById('filter-month')?.value || '';
  const ageGroup = state.devoteeAgeGroup || '';

  const matchesAge = (d) => {
    if (!ageGroup) return true;
    const age = calculateAge(d.dob);
    if (typeof age !== 'number' || !isFinite(age)) return false;
    if (ageGroup === '0-25') return age <= 25;
    if (ageGroup === '26-50') return age > 25 && age <= 50;
    if (ageGroup === '51-60') return age > 50 && age <= 60;
    return age > 60; // '60+'
  };

  return state.devotees.filter(d => {
    const matchesSearch = !searchQuery ||
      (d.legalName && d.legalName.toLowerCase().includes(searchQuery)) ||
      (d.spiritualName && d.spiritualName.toLowerCase().includes(searchQuery)) ||
      (d.phone && d.phone.toLowerCase().includes(searchQuery)) ||
      (d.city && d.city.toLowerCase().includes(searchQuery)) ||
      (d.address && d.address.toLowerCase().includes(searchQuery)) ||
      (d.pincode && d.pincode.toLowerCase().includes(searchQuery)) ||
      (d.guru && d.guru.toLowerCase().includes(searchQuery)) ||
      (d.currentSeva && d.currentSeva.toLowerCase().includes(searchQuery)) ||
      (d.courierTrackingNo && d.courierTrackingNo.toLowerCase().includes(searchQuery)) ||
      (d.trackingId && d.trackingId.toLowerCase().includes(searchQuery));

    const matchesCity = !filterCity || (d.city && d.city.toLowerCase() === filterCity.toLowerCase());

    let matchesMonth = true;
    if (filterMonth) {
      const monthNum = parseInt(filterMonth);
      const dobParts = parseDateParts(d.dob);
      const annivParts = parseDateParts(d.anniversaryDate || d.anniversaryRaw || d.anniversary);
      // Month filter applies to BOTH Birthday and Anniversary
      matchesMonth = (dobParts && (dobParts.month + 1) === monthNum) ||
                     (annivParts && (annivParts.month + 1) === monthNum);
    }

    return matchesSearch && matchesCity && matchesMonth && matchesAge(d);
  });
}

// Export the CURRENTLY FILTERED Devotee Directory list as a printable PDF report
// (respects search, city, month and the age-group filter exactly like the table).
function exportFilteredDevoteesPDF() {
  if (!requirePermission('export_data', 'export the directory as PDF')) return;
  const filteredList = getFilteredDirectoryDevotees()
    .sort((a, b) => (parseInt(a.slNo) || 0) - (parseInt(b.slNo) || 0));
  if (filteredList.length === 0) {
    showToast('No devotees to export. Adjust the filters and try again.', 'info');
    alert('No devotees to export. Adjust the filters and try again.');
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Human-readable filter context for the report header
  const filterParts = [];
  const ageGroup = state.devoteeAgeGroup || '';
  const srch = (document.getElementById('devotee-search')?.value || '').trim();
  const fCity = document.getElementById('filter-city')?.value || '';
  const fMonth = document.getElementById('filter-month')?.value || '';
  if (ageGroup) filterParts.push(`Age ${ageGroupLabel(ageGroup)}`);
  if (fCity) filterParts.push(`City: ${fCity}`);
  if (fMonth) filterParts.push(`Month: ${getMonthName(parseInt(fMonth))}`);
  if (srch) filterParts.push(`Search: "${srch}"`);
  const scopeLabel = filterParts.length ? filterParts.join(' • ') : 'Full Directory';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ISKCON Devotee Directory - Report</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 12px; color: #1e293b; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-box { border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
    .org-title { font-size: 18px; font-weight: 800; color: #0f766e; margin: 0 0 3px 0; letter-spacing: -0.3px; }
    .sub-title { font-size: 11px; color: #64748b; margin: 0; }
    .meta-box { text-align: right; font-size: 10.5px; color: #334155; line-height: 1.4; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-weight: 700; font-size: 10px; }
    .scope-line { font-weight: 700; color: #0f766e; margin-top: 2px; max-width: 380px; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 4px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background: #0f766e; color: #ffffff; padding: 7px 8px; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; text-align: left; border: 1px solid #0d6b63; }
    th.center, td.center { text-align: center; }
    td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: middle; color: #334155; }
    tr:nth-child(even) { background: #f8fafc; }
    .sno-col { font-weight: 800; font-family: "Courier New", Courier, monospace; color: #0f766e; font-size: 11px; }
    .devotee-main { font-weight: 700; color: #0f172a; font-size: 11px; }
    .devotee-sub { font-size: 9.5px; color: #64748b; margin-top: 1px; }
    .city-tag { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #f0fdfa; color: #115e59; border: 1px solid #ccfbf1; font-weight: 600; font-size: 10px; }
    .footer-bar { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <div class="org-title">ISKCON Devotee Directory — Report</div>
      <p class="sub-title">Sri Sri Radha Madan Mohan Mandir, Durgapur • Official Congregation Database</p>
    </div>
    <div class="meta-box">
      <div>Export Date: <strong>${dateStr}</strong></div>
      <div>Records: <span class="badge">${filteredList.length} Devotee(s)</span></div>
      <div class="scope-line">Scope: ${escapeHtml(scopeLabel)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="center" style="width: 45px;">S.No.</th>
        <th style="width: 190px;">Name</th>
        <th style="width: 100px;">Birthday</th>
        <th style="width: 95px;">Anniversary</th>
        <th class="center" style="width: 45px;">Age</th>
        <th style="width: 100px;">Phone</th>
        <th style="width: 110px;">City</th>
        <th>Address</th>
      </tr>
    </thead>
    <tbody>
      ${filteredList.map(d => {
        const displayName = d.spiritualName || d.legalName || 'N/A';
        const secondary = (d.spiritualName && d.legalName) ? d.legalName : '';
        const age = calculateAge(d.dob);
        const bday = d.birthdayRaw || formatDate(d.dob);
        const anniv = d.anniversaryRaw || d.anniversaryDate || d.anniversary || '—';
        const phone = d.phone || 'N/A';
        const city = d.city || 'N/A';
        const addr = (d.address ? d.address : 'No address recorded') + (d.pincode ? ' - ' + d.pincode : '');
        return `
          <tr>
            <td class="center sno-col">${d.slNo || ''}</td>
            <td>
              <div class="devotee-main">${escapeHtml(displayName)}</div>
              ${secondary ? `<div class="devotee-sub">${escapeHtml(secondary)}</div>` : ''}
            </td>
            <td>${escapeHtml(bday)}</td>
            <td>${escapeHtml(anniv)}</td>
            <td class="center">${typeof age === 'number' && age > 0 ? age + ' yrs' : 'N/A'}</td>
            <td>${escapeHtml(phone)}</td>
            <td><span class="city-tag">${escapeHtml(city)}</span></td>
            <td>${escapeHtml(addr)}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="footer-bar">
    <span>ISKCON Congregation Department • Devotee Directory Report</span>
    <span>Generated automatically via Portal Management System</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
    showToast(`PDF generated for ${filteredList.length} record(s).`, 'success');
  } else {
    alert('Popup blocked! Please allow popups to export the PDF.');
  }
}

function exportFilteredDevoteesCSV() {
  if (!requirePermission('export_data', 'export the directory as CSV')) return;
  const filtered = getFilteredDirectoryDevotees();

  if (filtered.length === 0) {
    showToast('No devotees to export.', 'info');
    return;
  }

  const headers = ['ID', 'Legal Name', 'Spiritual Name', 'Gender', 'Birthday', 'Anniversary', 'Age', 'Phone', 'WhatsApp', 'Email', 'City', 'Address', 'PIN', 'Ashrama', 'Initiation', 'Guru', 'Blood Group', 'Counselor', 'Current Seva'];
  const rows = filtered.map(d => [
    d.id || '',
    d.legalName || '',
    d.spiritualName || '',
    d.gender || '',
    d.dob || '',
    d.anniversaryRaw || d.anniversaryDate || d.anniversary || '',
    calculateAge(d.dob),
    d.phone || '',
    d.whatsapp || '',
    d.email || '',
    d.city || '',
    d.address || '',
    d.pincode || '',
    d.ashrama || '',
    d.initiationStatus || '',
    d.guru || '',
    d.bloodGroup || '',
    d.counselor || '',
    d.currentSeva || ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `ISKCON_Devotee_Directory_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Exported ${filtered.length} devotees to CSV!`, 'success');
}

function exportBirthdayListExcel() {
  if (!window.XLSX) return;

  const celebrations = getAllCelebrations()
    .sort((a, b) => a.timing.daysRemaining - b.timing.daysRemaining);

  const rows = celebrations.map(item => {
    const d = item.devotee;
    const isCouple = !!item.isCouple && item.spouseDevotee;
    const spouse = item.spouseDevotee;

    const spiritualName = isCouple 
      ? `${d.spiritualName || d.legalName} & ${spouse.spiritualName || spouse.legalName}`
      : (d.spiritualName || d.legalName);

    const legalName = isCouple 
      ? `${d.legalName} & ${spouse.legalName}`
      : d.legalName;

    const phone = isCouple
      ? `${d.phone || ''}${spouse.phone ? ' / ' + spouse.phone : ''}`
      : (d.phone || '');

    const whatsapp = isCouple
      ? `${d.whatsapp || ''}${spouse.whatsapp ? ' / ' + spouse.whatsapp : ''}`
      : (d.whatsapp || '');

    return {
      'Event Type': item.label,
      'Spiritual Name': spiritualName,
      'Legal Name': legalName,
      'Event Date': item.date,
      'Celebration Milestone': item.milestone,
      'Spouse Name': item.spouse || (d.spouseName || ''),
      'Days Remaining': item.timing.daysRemaining,
      'Phone': phone,
      'WhatsApp': whatsapp,
      'City / Center': d.city,
      'Guru Maharaj': d.guru,
      'Counselor / Teacher': d.counselor
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Celebration Schedule');
  XLSX.writeFile(wb, `ISKCON_Celebration_Schedule_${new Date().toISOString().split('T')[0]}.xlsx`);
  showToast('Celebration schedule exported to Excel!', 'success');
}

function exportSelectedCelebrationsPDF() {
  if (!requirePermission('export_data', 'export selected celebrations as PDF')) return;
  if (!state.selectedCelebrations || state.selectedCelebrations.size === 0) {
    showToast('Please select at least one devotee.', 'warning');
    alert('Please select at least one record.');
    return;
  }

  const eventType = state.celebrationEventType;
  const selected = getAllCelebrations()
    .filter(item => {
      const matchType = (eventType === 'ALL' || item.eventType === eventType);
      const isSelected = state.selectedCelebrations.has(item.devotee.id) || (item.spouseDevotee && state.selectedCelebrations.has(item.spouseDevotee.id));
      return matchType && isSelected;
    })
    .sort((a, b) => a.timing.daysRemaining - b.timing.daysRemaining);

  if (selected.length === 0) {
    showToast('No matching celebration records for the current tab.', 'warning');
    return;
  }

  const trHtml = selected.map((item, i) => {
    const d = item.devotee;
    const isCouple = !!item.isCouple && item.spouseDevotee;
    const spouse = item.spouseDevotee;

    const displayName = isCouple
      ? `${d.spiritualName || d.legalName} & ${spouse.spiritualName || spouse.legalName}`
      : `${d.spiritualName || d.legalName}${d.spiritualName ? ` (${d.legalName})` : ''}`;

    const phone = isCouple
      ? `${d.phone || ''}${spouse.phone ? ' / ' + spouse.phone : ''}` || 'N/A'
      : (d.phone || 'N/A');

    const dateText = item.rawDateStr || formatDate(item.date);

    // Full mailing address: House/Street + City + State + PIN
    const buildAddress = (dev) => {
      if (!dev) return '';
      return [dev.address, dev.city, dev.pincode, dev.state].filter(Boolean).join(', ') || '';
    };
    const addr1 = buildAddress(d);
    const addr2 = spouse ? buildAddress(spouse) : '';
    const address = isCouple
      ? (addr2 && addr2 !== addr1 ? `${addr1}<br>${addr2}` : (addr1 || addr2))
      : addr1;

    return `<tr>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px">${i + 1}</td>
      <td style="text-align:left;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px">${displayName}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;white-space:nowrap">${dateText}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;white-space:nowrap">${phone}</td>
      <td style="text-align:left;border:1px solid #cbd5e1;padding:6px 8px;font-size:10px;line-height:1.4">${address || 'N/A'}</td>
    </tr>`;
  }).join('');

  const isAnniv = eventType === 'MARRIAGE';
  const titleLabel = isAnniv ? 'Vaishnava Vivaha Anniversaries' : 'Devotee Birthdays';
  const dateColLabel = isAnniv ? 'Anniversary' : 'Birthday';
  const accent = isAnniv ? '#047857' : '#be185d';
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ISKCON Durgapur - Selected ${titleLabel}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 12px; color: #1e293b; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-box { border-bottom: 2px solid ${accent}; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
    .org-title { font-size: 17px; font-weight: 800; color: ${accent}; margin: 0 0 3px 0; }
    .sub-title { font-size: 11px; color: #64748b; margin: 0; }
    .meta-box { text-align: right; font-size: 10.5px; color: #334155; line-height: 1.5; }
    h3 { font-size: 13px; margin: 4px 0 8px 0; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
    .footer { margin-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header-box">
    <div>
      <p class="org-title">ISKCON Durgapur — Seva Portal</p>
      <p class="sub-title">Selected ${titleLabel} — Name, ${dateColLabel}, Phone & Address</p>
    </div>
    <div class="meta-box">
      <div>Generated: ${dateStr}</div>
      <div>Records: <strong>${selected.length}</strong></div>
    </div>
  </div>
  <table border="0" cellspacing="0" cellpadding="0">
    <thead>
      <tr>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">S.No.</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Devotee Name</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">${dateColLabel}</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Phone</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Address</th>
      </tr>
    </thead>
    <tbody>${trHtml}</tbody>
  </table>
  <div class="footer">Sri Sri Radha Madan Mohan Mandir, ISKCON Durgapur — For internal seva coordination only.</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    showToast('Please allow pop-ups for this portal.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch (e) {} }, 350);
  showToast(`Selected ${titleLabel} opened for PDF export.`, 'success');
}

function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);

      let importedCount = 0;
      json.forEach(row => {
        const legalName = row['Legal Name'] || row['Name'] || row['NAME'] || row['legalName'];
        if (legalName) {
          const rawPhoto = String(row['PHOTO'] || row['Photo'] || row['photo'] || row['Photo Link'] || row['photoLink'] || row['Avatar'] || row['Image'] || row['Drive Link'] || '').trim();
          const driveId = extractGoogleDriveFileId(rawPhoto);
          const photoDirect = driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : (rawPhoto.startsWith('http') ? rawPhoto : '');

          const newDevotee = {
            id: row['DEVOTEE ID'] || row['Devotee ID'] || row['id'] || `DEV-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 1000)}`,
            legalName: legalName,
            spiritualName: row['Initiated Name'] || row['INITIATED NAME'] || row['Spiritual Name'] || row['spiritualName'] || '',
            spouseName: row['Spouse Name'] || row['SPOUSE NAME'] || row['spouseName'] || '',
            ashrama: row['Ashrama'] || row['ashrama'] || 'Grihastha',
            gender: row['Gender'] || row['gender'] || 'Male',
            dob: row['Date of Birth'] || row['BIRTHDAY'] || row['Birthday'] || row['dob'] || '',
            birthdayRaw: row['BIRTHDAY'] || row['Birthday'] || '',
            anniversaryRaw: row['ANNIVERSARY'] || row['Anniversary'] || row['ANNIVERSARY '] || '',
            phone: String(row['Contact No'] || row['CONTACT NO'] || row['Phone'] || row['phone'] || ''),
            whatsapp: String(row['WhatsApp'] || row['whatsapp'] || row['Contact No'] || row['CONTACT NO'] || row['Phone'] || ''),
            email: row['Email'] || row['email'] || '',
            city: row['City'] || row['CITY'] || row['city'] || 'Durgapur',
            address: row['Address'] || row['ADDRESS'] || row['address'] || '',
            pincode: String(row['Pin Code'] || row['PIN CODE'] || row['pincode'] || '713204'),
            photo: rawPhoto,
            photoDirect: photoDirect,
            bloodGroup: row['Blood Group'] || row['bloodGroup'] || 'Unknown',
            isBloodDonor: row['Blood Donor'] || row['isBloodDonor'] || 'No',
            guru: row['Diksa Guru'] || row['guru'] || '',
            initiationStatus: row['Initiation Status'] || row['initiationStatus'] || 'Initiated',
            counselor: row['Counselor'] || row['counselor'] || '',
            counselorGroup: row['Sangha Group'] || row['counselorGroup'] || '',
            currentSeva: row['Current Seva'] || row['currentSeva'] || '',
            notes: row['Notes'] || row['NOTES'] || row['notes'] || ''
          };
          state.devotees.push(newDevotee);
          importedCount++;
        }
      });

      saveToStorage();
      logActivity('import', 'Database', `Imported ${importedCount} devotee record(s) from Excel.`);
      initApp();
      showToast(`Successfully imported ${importedCount} devotee records!`, 'success');
    } catch (err) {
      alert('Error parsing Excel file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function confirmResetToSampleData() {
  if (!requirePermission('manage_settings', 'reset the database to sample data')) return;
  if (confirm('Load authentic ISKCON devotee sample data? Any unsaved local edits will be replaced.')) {
    const seed = getInitialSampleData();
    state.devotees = seed.devotees;
    state.counselors = seed.counselors;
    saveToStorage();
    logActivity('import', 'Database', `Reset database to sample data (${state.devotees.length} devotees).`);
    initApp();
    showToast('Reset to authentic sample data!', 'success');
  }
}

function confirmClearDatabase() {
  if (!requirePermission('manage_settings', 'purge the entire database')) return;
  if (confirm('WARNING: Are you sure you want to permanently clear the devotee database? Make sure you have exported a JSON backup first!')) {
    state.devotees = [];
    state.counselors = [];
    saveToStorage();
    logActivity('clear', 'Database', 'Cleared the entire local devotee database.');
    initApp();
    showToast('Database wiped successfully', 'info');
  }
}

// ----------------------------------------------------
// TOAST NOTIFICATIONS
// ----------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let bg = 'bg-slate-800 text-white';
  let icon = 'info';

  if (type === 'success') {
    bg = 'bg-emerald-600 text-white';
    icon = 'check-circle';
  } else if (type === 'error') {
    bg = 'bg-rose-600 text-white';
    icon = 'alert-triangle';
  }

  toast.className = `${bg} px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center space-x-2 transition-all transform duration-300 opacity-0 translate-y-2 pointer-events-auto`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// ----------------------------------------------------
// BOOTSTRAP APPLICATION ON LOAD
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});
