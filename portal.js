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
  INITIALIZED: 'iskcon_devotee_care_initialized_v1',
  PARCEL_PURGED: 'iskcon_devotee_care_parcels_purged_v2'
};

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
  selectedParcels: new Set()
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

function getCleanDefaultAvatarHtml(displayName, gender, sizeClass = 'w-10 h-10', textClass = 'text-xs', devoteeId = '', enableHover = true) {
  const initials = getDevoteeInitials(displayName);
  const isFemale = (gender || '').toLowerCase() === 'female';
  const bgGradient = isFemale 
    ? 'from-rose-500 to-purple-600 text-white border-rose-200' 
    : 'from-teal-600 to-indigo-600 text-white border-teal-200';
  const safeName = escapeHtml(displayName);
  const clickHandler = devoteeId ? `onclick="viewDevoteeProfile('${devoteeId}')"` : '';
  const hoverHandlers = (devoteeId && enableHover) 
    ? `onmouseenter="showDevoteeHoverCard(event, '${devoteeId}')" onmouseleave="scheduleHideDevoteeHoverCard()"` 
    : '';

  return `
    <div class="group/avatar relative ${sizeClass} flex-shrink-0 cursor-pointer" ${clickHandler} ${hoverHandlers} title="View ${safeName}'s profile">
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
      <div class="group/avatar relative ${sizeClass} flex-shrink-0 cursor-pointer" onclick="viewDevoteeProfile('${d.id}')" ${hoverHandlers} title="View ${safeName}'s profile">
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
      maritalStatus: 'Married',
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
      maritalStatus: 'Widowed',
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
      maritalStatus: 'Single',
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
      maritalStatus: 'Married',
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
      maritalStatus: 'Single',
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
      maritalStatus: 'Married',
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
  const year = todayDate.getFullYear();

  // Celebration-style dropdowns: current month pre-selected as "This Month"
  const celebrationOptions = (withAll) => {
    let html = `<option value="${curMonthNum}" selected>🌸 This Month · ${curName} ${year}</option>`;
    if (withAll) html += `<option value="ALL">🗓️ All 12 Months</option>`;
    monthNames.forEach((m, i) => {
      if (i === currentMonth) return;
      html += `<option value="${i + 1}">${m}</option>`;
    });
    return html;
  };

  const bdaySel = document.getElementById('bday-select-month');
  if (bdaySel) bdaySel.innerHTML = celebrationOptions(true);

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
    photoDirect: directPhoto
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

      // Keep any devotees from master dataset not present in Supabase table
      const syncedIds = new Set(updatedDevotees.map(d => d.id));
      (state.devotees || []).forEach(d => {
        if (d.id && !syncedIds.has(d.id)) {
          updatedDevotees.push(d);
        }
      });

      state.devotees = updatedDevotees;
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
  } catch (err) {
    console.error('❌ Unexpected error fetching from Supabase:', err);
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

  // Initial renders
  populateMonthFilters();
  populateCityFilter();
  updateKPIs();
  renderDashboard();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  initCharts();

  if (window.lucide) {
    lucide.createIcons();
  }

  // Initialize Supabase Auth & Gated Session
  initAuthSystem();
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEYS.DEVOTEES, JSON.stringify(state.devotees));
  localStorage.setItem(STORAGE_KEYS.COUNSELORS, JSON.stringify(state.counselors));
  localStorage.setItem(STORAGE_KEYS.PARCELS, JSON.stringify(state.parcels || []));
}

function loadFromStorage() {
  try {
    state.devotees = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEVOTEES)) || [];
    state.counselors = JSON.parse(localStorage.getItem(STORAGE_KEYS.COUNSELORS)) || [];
    state.parcels = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARCELS)) || [];
  } catch (e) {
    console.error('Error loading data from storage:', e);
    const seed = getInitialSampleData();
    state.devotees = (typeof DURGAPUR_DEVOTEES !== 'undefined' && Array.isArray(DURGAPUR_DEVOTEES)) ? DURGAPUR_DEVOTEES : seed.devotees;
    state.counselors = seed.counselors;
    state.parcels = [];
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
    'parcelCreatedAt', 'parcelCreated', 'hasParcel', 'parcelType', 'parcelDescription'
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
// 🔐 SUPABASE AUTHENTICATION & ACCESS CONTROL (ISKCON DURGAPUR)
// ======================================================================
let currentUser = null;
let currentUserRole = 'ADMIN';

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

function getUserRole(user) {
  if (!user) return 'VIEWER';
  const rawRole = (
    user.user_metadata?.role ||
    user.app_metadata?.role ||
    user.role ||
    'ADMIN' // Default to ADMIN so existing modules are fully accessible
  ).toString().toUpperCase().replace(/[\s-]/g, '_');

  return USER_ROLES[rawRole] ? rawRole : 'ADMIN';
}

function getUserDisplayName(user) {
  if (!user) return 'Devotee';
  if (user.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user.user_metadata?.name) return user.user_metadata.name;
  if (user.email) {
    const prefix = user.email.split('@')[0];
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return 'Devotee';
}

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

function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const portalApp = document.getElementById('portal-app');
  if (authScreen) authScreen.classList.remove('hidden');
  if (portalApp) portalApp.classList.add('hidden');
  updateAuthHeader(null);
  if (window.lucide) lucide.createIcons();
}

function showPortalDashboard(user) {
  const authScreen = document.getElementById('auth-screen');
  const portalApp = document.getElementById('portal-app');
  if (authScreen) authScreen.classList.add('hidden');
  if (portalApp) portalApp.classList.remove('hidden');
  updateAuthHeader(user);
  if (window.lucide) lucide.createIcons();
}

function updateAuthHeader(user) {
  const container = document.getElementById('auth-header-container');
  if (!container) return;

  if (user && user.email) {
    const roleKey = getUserRole(user);
    currentUserRole = roleKey;
    const roleConfig = USER_ROLES[roleKey] || USER_ROLES.ADMIN;
    const displayName = getUserDisplayName(user);
    const initial = displayName.charAt(0).toUpperCase();

    container.innerHTML = `
      <div class="flex items-center space-x-2.5">
        <!-- User Profile Pill -->
        <div class="flex items-center space-x-2 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 shadow-sm">
          <div class="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow">
            ${initial}
          </div>
          <div class="hidden sm:flex flex-col text-left">
            <div class="flex items-center space-x-1.5">
              <span class="text-xs font-semibold text-white truncate max-w-[120px]" title="${displayName}">${displayName}</span>
              <span class="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${roleConfig.badgeClass}">${roleConfig.label}</span>
            </div>
            <span class="text-[10px] text-slate-400 truncate max-w-[120px] leading-tight" title="${user.email}">${user.email}</span>
          </div>
        </div>

        <!-- Logout Button -->
        <button onclick="handleAuthSignOut()" class="flex items-center space-x-1 bg-rose-950/60 hover:bg-rose-900/90 text-rose-300 border border-rose-800/60 font-semibold px-2.5 py-1.5 rounded-xl shadow-sm transition text-xs" title="Sign Out of Portal">
          <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
          <span class="hidden md:inline">Logout</span>
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button onclick="showAuthScreen()" class="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3.5 py-1.5 rounded-lg shadow-sm transition text-xs">
        <i data-lucide="log-in" class="w-4 h-4"></i>
        <span>Sign In</span>
      </button>
    `;
  }

  if (window.lucide) lucide.createIcons();
}

async function handleAuthSignIn(event) {
  event.preventDefault();
  clearAuthAlert();

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    showAuthAlert('Please enter both your email address and password.', 'error');
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
    const { data, error } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      showAuthAlert(formatAuthErrorMessage(error), 'error');
      return;
    }

    if (data && data.user) {
      currentUser = data.user;
      showPortalDashboard(currentUser);
      const name = getUserDisplayName(currentUser);
      if (typeof showToast === 'function') {
        showToast(`Hare Krishna, ${name}! Welcome back.`, 'success');
      }
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

  currentUser = null;
  currentUserRole = 'VIEWER';
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
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

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
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeResetPasswordModal() {
  const modal = document.getElementById('reset-password-modal');
  if (modal) modal.classList.add('hidden');
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

    closeResetPasswordModal();
    currentUser = data.user;
    showPortalDashboard(currentUser);
    if (typeof showToast === 'function') {
      showToast('Password updated successfully! Welcome to the portal.', 'success');
    }
    // Clean URL hash
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
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
      openResetPasswordModal();
      return;
    }

    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      showPortalDashboard(currentUser);
      await initSupabaseAndSync();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
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

  // 2. Check for password recovery hash in URL
  const hash = window.location.hash || '';
  if (hash.includes('type=recovery') || hash.includes('access_token')) {
    console.log('🔑 Password recovery link detected in URL hash.');
    openResetPasswordModal();
    return;
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
      showPortalDashboard(currentUser);
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
function switchTab(tabId) {
  state.currentTab = tabId;

  // Toggle active view sections (Anniversaries tab reuses the wish-dashboard view)
  const views = ['dashboard', 'birthdays', 'parcels', 'devotees', 'settings'];
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

  // Highlight active nav tab button with distinct module identity
  const tabColorMap = {
    'dashboard': 'bg-indigo-600 text-white shadow-sm font-semibold',
    'birthdays': 'bg-rose-600 text-white shadow-sm font-semibold',
    'anniversaries': 'bg-emerald-600 text-white shadow-sm font-semibold',
    'parcels': 'bg-sky-600 text-white shadow-sm font-semibold',
    'devotees': 'bg-teal-600 text-white shadow-sm font-semibold',
    'settings': 'bg-slate-700 text-white shadow-sm font-semibold'
  };

  document.querySelectorAll('.nav-tab').forEach(btn => {
    const t = btn.getAttribute('data-tab');
    if (t === tabId) {
      const activeColor = tabColorMap[tabId] || 'bg-indigo-600 text-white shadow-sm font-semibold';
      btn.className = `nav-tab px-3.5 py-2 rounded-md text-xs flex items-center space-x-2 transition ${activeColor}`;
    } else {
      btn.className = 'nav-tab px-3.5 py-2 rounded-md text-xs font-semibold flex items-center space-x-2 transition text-slate-300 hover:text-white hover:bg-slate-800/60';
    }
  });

  // Re-trigger specific tab renders
  if (tabId === 'dashboard') {
    updateKPIs();
    renderDashboard();
    initCharts();
  } else if (tabId === 'devotees') {
    renderDevoteesTable();
  } else if (tabId === 'birthdays') {
    setCelebrationEventType('BIRTHDAY');
  } else if (tabId === 'anniversaries') {
    setCelebrationEventType('MARRIAGE');
  } else if (tabId === 'parcels') {
    renderParcelsTable();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------
// KPI STATS COMPUTATION
// ----------------------------------------------------
function updateKPIs() {
  const totalDevotees = state.devotees.length;
  const totalDevoteesEl = document.getElementById('stat-total-devotees');
  if (totalDevoteesEl) totalDevoteesEl.innerText = totalDevotees;
  const totalCountEl = document.getElementById('total-count');
  if (totalCountEl) totalCountEl.innerText = totalDevotees;

  // Birthdays & Anniversaries this month & today
  let bdaysThisMonth = 0;
  let bdaysToday = 0;
  let initAnnivThisMonth = 0;
  let marriageAnnivThisMonth = 0;

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
    if (d.anniversaryDate) {
      const marrTiming = checkEventTiming(d.anniversaryDate);
      if (marrTiming.isThisMonth) marriageAnnivThisMonth++;
    }
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

  // Header anniversary badge
  const annivBadge = document.getElementById('nav-anniv-badge');
  if (annivBadge) {
    let annivToday = 0;
    state.devotees.forEach(d => {
      const a = d.anniversaryDate || d.anniversaryRaw || d.anniversary;
      if (a && checkEventTiming(a).isToday) annivToday++;
    });
    annivBadge.innerText = annivToday > 0 ? `${annivToday} Today!` : '💍';
  }

  // Logistics & Parcel Tracking KPIs — counted from LIVE auto-synced parcel records
  const parcelRecords = state.parcels || [];
  let pPacked = 0, pTransit = 0, pOut = 0, pDelivered = 0, pUnverified = 0;
  parcelRecords.forEach(p => {
    const s = p.parcelStatus || '';
    if (s === 'PACKED_BLESSED') pPacked++;
    else if (s === 'IN_TRANSIT') pTransit++;
    else if (s === 'OUT_FOR_DELIVERY') pOut++;
    else if (s === 'DELIVERED') pDelivered++;

    if (p.addressVerified === 'Needs Verification' || !p.addressVerified || (p.address && p.address.length < 15) || !p.pincode) {
      pUnverified++;
    }
  });

  const pTotalEl = document.getElementById('stat-parcel-total');
  if (pTotalEl) pTotalEl.innerText = parcelRecords.length;
  const pPackedEl = document.getElementById('stat-parcel-packed');
  if (pPackedEl) pPackedEl.innerText = pPacked;
  const pTransitEl = document.getElementById('stat-parcel-transit');
  if (pTransitEl) pTransitEl.innerText = pTransit;
  const pOutEl = document.getElementById('stat-parcel-out');
  if (pOutEl) pOutEl.innerText = pOut;
  const pDeliveredEl = document.getElementById('stat-parcel-delivered');
  if (pDeliveredEl) pDeliveredEl.innerText = pDelivered;
  const pUnverifiedEl = document.getElementById('stat-parcel-unverified');
  if (pUnverifiedEl) pUnverifiedEl.innerText = pUnverified;
  const pBadgeEl = document.getElementById('nav-parcel-badge');
  if (pBadgeEl) pBadgeEl.innerText = parcelRecords.length;

  // Senior Vaishnavas (60+)
  const seniorCount = state.devotees.filter(d => {
    const age = calculateAge(d.dob);
    return typeof age === 'number' && age >= 60;
  }).length;
  const seniorEl = document.getElementById('stat-senior-devotees');
  if (seniorEl) seniorEl.innerText = seniorCount;

  // Tracking System Stats
  const trackTotalEl = document.getElementById('track-total');
  if (trackTotalEl) trackTotalEl.innerText = parcelRecords.length;
  const trackTransitEl = document.getElementById('track-transit');
  if (trackTransitEl) trackTransitEl.innerText = pTransit + pOut;
  const trackDeliveredEl = document.getElementById('track-delivered');
  if (trackDeliveredEl) trackDeliveredEl.innerText = pDelivered;
  const trackPendingEl = document.getElementById('track-pending');
  if (trackPendingEl) trackPendingEl.innerText = pPacked + pUnverified;
  const trackReturnedEl = document.getElementById('track-returned');
  if (trackReturnedEl) trackReturnedEl.innerText = 0;

  // Total Anniversary
  const annivTotalEl = document.getElementById('stat-anniversary-total');
  if (annivTotalEl) annivTotalEl.innerText = marriageAnnivThisMonth;
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

  const filtered = state.devotees.filter(d => {
    const matchesSearch = !searchQuery ||
      (d.legalName && d.legalName.toLowerCase().includes(searchQuery)) ||
      (d.spiritualName && d.spiritualName.toLowerCase().includes(searchQuery)) ||
      (d.phone && d.phone.toLowerCase().includes(searchQuery)) ||
      (d.city && d.city.toLowerCase().includes(searchQuery)) ||
      (d.address && d.address.toLowerCase().includes(searchQuery)) ||
      (d.pincode && d.pincode.toLowerCase().includes(searchQuery)) ||
      (d.guru && d.guru.toLowerCase().includes(searchQuery)) ||
      (d.currentSeva && d.currentSeva.toLowerCase().includes(searchQuery));

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

    return matchesSearch && matchesCity && matchesMonth;
  });

  document.getElementById('filtered-count').innerText = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-10 text-slate-400">
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
  if (pageStartEl) pageStartEl.innerText = startIndex + 1;
  if (pageEndEl) pageEndEl.innerText = endIndex;

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

    // Anniversary cell (shows — if devotee has no anniversary)
    const annivStr = d.anniversaryRaw || d.anniversaryDate || d.anniversary || '';
    const annivMissing = !annivStr || ['na', 'n/a', 'no', 'none', 'null', '-'].includes(String(annivStr).trim().toLowerCase());
    let annivCell = '<span class="text-slate-400 font-semibold">—</span>';
    if (!annivMissing) {
      const annivTiming = checkEventTiming(d.anniversaryDate || annivStr);
      const annivPill = annivTiming.isToday ? '<span class="bg-pink-500 text-white font-bold text-[9px] px-1.5 py-0.2 rounded-full ml-1">Today!</span>' : '';
      annivCell = `
          <div class="font-semibold text-slate-800 flex items-center space-x-1.5">
            <span class="text-xs">💍</span>
            <span>${annivStr}</span>
            ${annivPill}
          </div>`;
    }

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${isChecked ? 'bg-teal-50/50' : ''}">
        <!-- Checkbox -->
        <td class="py-3.5 px-3 text-center">
          <input type="checkbox" data-id="${d.id}" data-slno="${serialNo}" onchange="toggleDevoteeSelection('${d.id}', this.checked, this)" ${isChecked ? 'checked' : ''} class="devotee-row-checkbox w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer">
        </td>
        <!-- Serial Number -->
        <td class="py-3.5 px-3 text-center text-slate-700 font-bold font-mono text-xs">${serialNo}</td>
        <!-- Name Column -->
        <td class="py-3.5 px-4 min-w-[200px]">
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

        <!-- 2. Birthday Column -->
        <td class="py-3.5 px-3 whitespace-nowrap">
          <div class="font-semibold text-slate-800 flex items-center space-x-1.5">
            <span class="text-xs">🎂</span>
            <span>${d.birthdayRaw || formatDate(d.dob)}</span>
          </div>
        </td>

        <!-- 3. Anniversary Column -->
        <td class="py-3.5 px-3 whitespace-nowrap">
          ${annivCell}
        </td>

        <!-- 4. City Column -->
        <td class="py-3.5 px-3 whitespace-nowrap">
          <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200/80">
            <i data-lucide="map-pin" class="w-3 h-3 text-teal-600"></i>
            <span>${d.city || 'N/A'}</span>
          </span>
        </td>

        <!-- 5. Address Column (Verified status derived from the address above) -->
        <td class="py-3.5 px-4 min-w-[230px] max-w-sm">
          <div class="rounded-lg border p-2.5 transition ${d.address ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}">
            ${d.address ? '<div class="text-[10px] font-bold mb-1 text-emerald-700">✓ Verified</div>' : ''}
            <div class="text-xs font-bold text-slate-800 leading-snug">
              ${d.address || '<span class="text-slate-400 italic font-normal">No address recorded</span>'}
            </div>
          </div>
        </td>

        <!-- 6. Phone Column -->
        <td class="py-3.5 px-3 whitespace-nowrap">
          ${d.phone ? `
            <a href="tel:${d.phone}" class="font-medium text-slate-700 hover:text-teal-600 flex items-center space-x-1 transition" title="Call Devotee (${d.phone})">
              <span class="text-xs">📞</span>
              <span>${d.phone}</span>
            </a>
          ` : `<span class="text-slate-400">N/A</span>`}
        </td>

        <!-- 7. Action Column -->
        <td class="py-3.5 px-4 text-right whitespace-nowrap">
          <div class="flex items-center justify-end space-x-1.5">
            <button onclick="editDevotee('${d.id}')" class="inline-flex items-center space-x-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 font-bold px-3 py-1.5 rounded-lg text-xs shadow-xs transition transform active:scale-95 cursor-pointer" title="✏️ Edit Devotee Profile">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              <span>Edit</span>
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

function bulkCreateParcelsForSelected() {
  if (!state.selectedCelebrations || state.selectedCelebrations.size === 0) {
    showToast('Please select at least one devotee.', 'warning');
    return;
  }
  const selectedDevotees = state.devotees.filter(d => state.selectedCelebrations.has(d.id));
  if (selectedDevotees.length === 0) return;
  if (!confirm(`Create prasadam parcels for ${selectedDevotees.length} selected devotee(s)?`)) return;

  const parcelType = state.celebrationEventType === 'MARRIAGE' ? 'Anniversary' : 'Birthday';
  const todayStr = new Date().toISOString().split('T')[0];
  const exp = new Date(todayStr);
  exp.setDate(exp.getDate() + 4);
  const expectedDeliveryDate = exp.toISOString().split('T')[0];
  if (!state.parcels) state.parcels = [];

  let created = 0;
  selectedDevotees.forEach(d => {
    d.addressVerified = 'Verified';
    d.parcelCreated = true;
    d.hasParcel = true;
    d.parcelCreatedAt = new Date().toISOString();
    d.parcelType = parcelType;
    d.courierPartner = 'Delhivery';
    d.courierTrackingNo = ''; // blank at creation — added manually later
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
      addressVerified: 'Verified',
      dob: d.dob,
      birthdayRaw: d.birthdayRaw,
      anniversaryDate: d.anniversaryDate,
      parcelType: parcelType,
      parcelDescription: d.parcelDescription || 'Sanctified Sri Sri Radha Madhava Maha-Prasadam Laddu, Tulasi Leaves, Sacred Kalash Blessings & Srimad Bhagavad-gita',
      courierPartner: 'Delhivery',
      courierTrackingNo: '',
      trackingId: d.trackingId,
      bookingDate: todayStr,
      expectedDeliveryDate: expectedDeliveryDate,
      remarks: d.remarks || 'Handle with utmost care, sacred deity offering. Call devotee before delivery.',
      createdAt: new Date().toISOString()
    };

    const pIdx = state.parcels.findIndex(p => p.devoteeId === d.id);
    if (pIdx >= 0) {
      state.parcels[pIdx] = record;
    } else {
      state.parcels.unshift(record);
    }
    created++;
  });

  saveToStorage();
  updateKPIs();
  renderBirthdaysGrid();
  renderDevoteesTable();
  renderParcelsTable();
  clearCelebrationSelection();
  showToast(`✅ ${created} parcel(s) created successfully!`, 'success');
}

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
  const search = document.getElementById('devotee-search');
  if (search) search.value = '';
  const c = document.getElementById('filter-city');
  if (c) c.value = '';
  const m = document.getElementById('filter-month');
  if (m) m.value = '';
  renderDevoteesTable();
}

// ----------------------------------------------------
// DEVOTEE MODAL CREATE / EDIT
// ----------------------------------------------------
function openDevoteeModal(devoteeId = null) {
  const modal = document.getElementById('devotee-modal');
  const form = document.getElementById('devotee-form');
  form.reset();
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

      // Edit mode = compact "Address & Phone" update window only
      setDevoteeFormMode('contact');
      if (subTitle) subTitle.innerText = 'Update Address & Mobile Number';
      if (bannerName) bannerName.innerText = d.spiritualName || d.legalName || '';

      // Populate Basic
      document.getElementById('df-legal-name').value = d.legalName || '';
      document.getElementById('df-spiritual-name').value = d.spiritualName || '';
      document.getElementById('df-gender').value = d.gender || 'Male';
      document.getElementById('df-dob').value = d.dob || '';
      document.getElementById('df-ashrama').value = d.ashrama || 'Grihastha';
      document.getElementById('df-marital').value = d.maritalStatus || 'Single';
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

// Compact "Address & Phone" edit mode — hides everything in the devotee form
// except phone/whatsapp/address/city, so the Edit window stays clean & focused.
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
    if (card) { card.classList.remove('max-w-4xl'); card.classList.add('max-w-md'); }
    setDevoteeFormTab('basic');

    // Hide every Basic-tab field EXCEPT the phone & address fields
    devoteeEditHiddenCells = [];
    ['df-legal-name', 'df-spiritual-name', 'df-gender', 'df-dob', 'df-ashrama', 'df-marital', 'df-email']
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
    if (card) { card.classList.add('max-w-4xl'); card.classList.remove('max-w-md'); }
    devoteeEditHiddenCells.forEach(c => c.classList.remove('hidden'));
    devoteeEditHiddenCells = [];
  }
}

function saveDevotee(event) {
  event.preventDefault();
  const devoteeId = document.getElementById('devotee-id').value;

  const degrees = [];
  if (document.getElementById('df-deg-bs').checked) degrees.push('Bhakti Shastri');
  if (document.getElementById('df-deg-bv').checked) degrees.push('Bhakti Vaibhava');
  if (document.getElementById('df-deg-bved').checked) degrees.push('Bhakti Vedanta');
  if (document.getElementById('df-deg-bsar').checked) degrees.push('Bhakti Sarvabhauma');

  const photoInputVal = document.getElementById('df-photo')?.value.trim() || '';
  const driveId = extractGoogleDriveFileId(photoInputVal);
  const photoDirectVal = driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : photoInputVal;

  const devoteeData = {
    id: devoteeId || `DEV-${Date.now().toString().slice(-5)}`,
    legalName: document.getElementById('df-legal-name').value.trim(),
    spiritualName: document.getElementById('df-spiritual-name').value.trim(),
    gender: document.getElementById('df-gender').value,
    dob: document.getElementById('df-dob').value,
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

  if (devoteeId) {
    const idx = state.devotees.findIndex(x => x.id === devoteeId);
    if (idx !== -1) {
      const existing = state.devotees[idx];
      const finalPhoto = photoInputVal || existing.photo || '';
      const finalDriveId = extractGoogleDriveFileId(finalPhoto);
      const finalPhotoDirect = finalDriveId ? `https://lh3.googleusercontent.com/d/${finalDriveId}` : (existing.photoDirect || finalPhoto);
      state.devotees[idx] = {
        ...existing,
        ...devoteeData,
        photo: finalPhoto,
        photoDirect: finalPhotoDirect
      };
      showToast('Devotee profile updated successfully!', 'success');
    }
  } else {
    state.devotees.unshift(devoteeData);
    showToast('New devotee registered successfully!', 'success');
  }

  saveToStorage();
  updateDevoteeAutocompleteList();
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  initCharts();
  closeDevoteeModal();
}

function editDevotee(id) {
  closeProfileModal();
  openDevoteeModal(id);
}

function deleteDevotee(id) {
  const d = state.devotees.find(x => x.id === id);
  if (!d) return;
  const name = d.spiritualName || d.legalName;
  if (confirm(`Are you sure you want to remove ${name} from the devotee database?`)) {
    state.devotees = state.devotees.filter(x => x.id !== id);
    saveToStorage();
    updateDevoteeAutocompleteList();
    updateKPIs();
    renderDevoteesTable();
    renderBirthdaysGrid();
    renderParcelsTable();
    initCharts();
    showToast(`Removed devotee record for ${name}`, 'info');
  }
}

function deleteAllBirthdayAnniversaryRecords() {
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

  state.devotees = state.devotees.filter(d => !idsInTable.has(d.id));

  if (state.selectedDevotees) state.selectedDevotees.clear();
  if (state.selectedParcels) state.selectedParcels.clear();

  saveToStorage();
  updateDevoteeAutocompleteList();
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  initCharts();
  showToast(`Deleted ${count} birthday/anniversary record${count > 1 ? 's' : ''}`, 'success');
}

// ----------------------------------------------------
// VIEW DEVOTEE PROFILE MODAL
// ----------------------------------------------------
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
state.selectedCelebrationMonth = String(currentMonth + 1); // Default to the current month
state.selectedCelebrationDate = null; // Date View — exact-date filter (overrides month)
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

// Date column header: exact-date view shows both types (+Date), otherwise per-tab (Birthday / Anniversary)
function updateCelebrationDateColumnHeader() {
  const el = document.getElementById('bday-date-col-title');
  if (!el) return;
  if (state.selectedCelebrationDate) {
    el.innerText = '📅 Date';
  } else {
    el.innerText = (state.currentTab === 'anniversaries') ? '💍 Anniversary' : '🎂 Birthday';
  }
}

function getAllCelebrations() {
  const celebrations = [];

  state.devotees.forEach(d => {
    // 1. Birthday / Appearance Day
    const bdayStr = d.birthdayRaw || d.birthday || d.dob;
    if (bdayStr) {
      const timing = checkEventTiming(d.dob || bdayStr);
      let bMo = d.birthMonth || d.bMonth;
      let bDy = d.birthDay || d.bDay;
      if (!bMo && timing.parts) { bMo = timing.parts.month + 1; bDy = timing.parts.day; }
      const years = calculateYearsPassed(d.dob || bdayStr) + (timing.isToday ? 0 : 1);

      celebrations.push({
        id: d.id,
        devotee: d,
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

    // 2. Marriage Anniversary
    const annivStr = d.anniversaryRaw || d.anniversary || d.anniversaryDate;
    if (annivStr && annivStr !== 'None' && annivStr !== 'N/A') {
      const timing = checkEventTiming(d.anniversaryDate || annivStr);
      let aMo = d.annivMonth || d.aMonth;
      let aDy = d.annivDay || d.aDay;
      if (!aMo && timing.parts) { aMo = timing.parts.month + 1; aDy = timing.parts.day; }
      const years = calculateYearsPassed(d.anniversaryDate || annivStr) + (timing.isToday ? 0 : 1);

      celebrations.push({
        id: d.id,
        devotee: d,
        eventType: 'MARRIAGE',
        label: 'Marriage Anniversary',
        icon: 'heart',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        accentColor: 'border-emerald-300',
        date: d.anniversaryDate || annivStr,
        rawDateStr: d.anniversaryRaw || d.anniversary || formatDate(d.anniversaryDate),
        month: aMo || (timing.parts ? timing.parts.month + 1 : 1),
        day: aDy || (timing.parts ? timing.parts.day : 1),
        years: years,
        milestone: years > 0 ? `${years} Years of Vivaha Harmony` : 'Marriage Anniversary',
        spouse: d.spouseName,
        timing: timing
      });
    }
  });

  return celebrations;
}

function renderBirthdaysGrid() {
  const container = document.getElementById('bday-cards-grid');
  const tableBody = document.getElementById('bday-table-body');
  const emptyState = document.getElementById('bday-empty-state');
  if (!tableBody) return;

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

    // 4. Keyword search filter
    if (search) {
      const sName = (d.spiritualName || '').toLowerCase();
      const lName = (d.legalName || '').toLowerCase();
      const phone = (d.phone || '').toLowerCase();
      const city = (d.city || '').toLowerCase();
      const pin = (d.pincode || '').toLowerCase();
      const id = (d.id || '').toLowerCase();
      if (!sName.includes(search) && !lName.includes(search) && !phone.includes(search) && !city.includes(search) && !pin.includes(search) && !id.includes(search)) {
        return false;
      }
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
    const pRec = (state.parcels || []).find(p => p.devoteeId === it.devotee.id);
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

  // Render Table View: Select ☑ | S.No. | Name | Date | Type | Phone | Address Verified | Create Parcel | Actions
  tableBody.innerHTML = filtered.map((item, idx) => {
    const d = item.devotee;
    const displayName = d.spiritualName || d.legalName;
    const secondaryName = d.spiritualName ? d.legalName : '';
    const isVerified = (d.addressVerified === 'Verified' || (d.address && d.address.length >= 25 && d.addressVerified !== 'Needs Verification'));
    const liveParcel = (state.parcels || []).find(p => p.devoteeId === d.id);
    const hasParcel = !!liveParcel;
    const bdayDateText = item.rawDateStr || formatDate(item.date);
    const eventIcon = item.eventType === 'MARRIAGE' ? '💍' : '🎂';
    const serialNo = idx + 1;
    const isSel = state.selectedCelebrations.has(d.id);

    return `
      <tr class="hover:bg-slate-50/90 transition border-b border-slate-100 ${isSel ? 'bg-pink-50/40' : ''}">
        <!-- 0. Select -->
        <td class="py-3 px-2 text-center">
          <input type="checkbox" data-id="${d.id}" onchange="toggleCelebrationSelection('${d.id}', this.checked, this)" ${isSel ? 'checked' : ''} class="celebration-row-checkbox w-4 h-4 rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer" title="Select for bulk actions">
        </td>
        <!-- 1. S.No. -->
        <td class="py-3 px-2 text-center">
          <span class="font-bold text-slate-500">${serialNo}</span>
        </td>
        <!-- 2. Name -->
        <td class="py-3 px-4">
          <div class="flex items-center space-x-2.5">
            ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
            <div>
              <div class="font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition flex items-center space-x-1" onclick="viewDevoteeProfile('${d.id}')">
                <span>${displayName}</span>
              </div>
              <div class="text-[11px] text-slate-500 flex items-center space-x-1">
                ${secondaryName ? `<span>${secondaryName}</span><span>•</span>` : ''}
                <span class="font-mono text-indigo-600 font-semibold">${d.id}</span>
              </div>
            </div>
          </div>
        </td>

        <!-- 2. Birthday -->
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
            <span>${eventIcon}</span>
            <span>${bdayDateText}</span>
          </div>
          <div class="text-[11px] text-pink-600 font-medium mt-0.5">${item.milestone}</div>
        </td>

        <!-- 2b. Type (Birthday / Anniversary) -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${item.eventType === 'MARRIAGE'
            ? '<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><span>💍</span><span>Anniversary</span></span>'
            : '<span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-pink-100 text-pink-800 border border-pink-200"><span>🎂</span><span>Birthday</span></span>'}
        </td>

        <!-- 3. Phone -->
        <td class="py-3 px-4 whitespace-nowrap">
          ${d.phone ? `
            <div class="flex items-center space-x-1.5">
              <a href="tel:${d.phone}" class="font-medium text-slate-700 hover:text-indigo-600 flex items-center space-x-1 transition text-xs" title="Call Devotee">
                <i data-lucide="phone" class="w-3.5 h-3.5 text-emerald-600"></i>
                <span class="font-mono">${d.phone}</span>
              </a>
              <button onclick="copyToClipboard('${d.phone}', 'Phone copied!')" class="text-slate-400 hover:text-slate-600 p-0.5 transition" title="Copy Phone">
                <i data-lucide="copy" class="w-3 h-3"></i>
              </button>
            </div>
          ` : `<span class="text-slate-400 text-xs italic">No phone</span>`}
        </td>

        <!-- 4. Address Verified (read-only status — controlled from Devotee Directory only) -->
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center">
            ${isVerified ? `
              <span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs cursor-default" title="Verified in Devotee Directory">
                <span>🟢</span>
                <span>Verified</span>
              </span>
            ` : `
              <span class="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs cursor-default" title="Not yet verified — update from Devotee Directory">
                <span>🔴</span>
                <span>Unverified</span>
              </span>
            `}
          </div>
        </td>

        <!-- 5. Create Parcel -->
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center space-y-1">
            <button onclick="openCreateParcelModal('${d.id}', '${item.eventType === 'MARRIAGE' ? 'Anniversary' : 'Birthday'}')" 
              class="inline-flex items-center space-x-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-sm hover:shadow transition transform active:scale-95 cursor-pointer">
              <span>📦</span>
              <span>Create Parcel</span>
            </button>
            ${hasParcel ? `
              <div class="flex items-center space-x-1 text-[10px]">
                <button onclick="openParcelTrackerModal('${d.id}')" class="text-sky-700 hover:text-sky-900 font-mono font-bold flex items-center space-x-0.5 hover:underline" title="Track Live Consignment">
                  <i data-lucide="navigation" class="w-2.5 h-2.5"></i>
                  <span>Track (${(liveParcel && (liveParcel.courierTrackingNo || liveParcel.trackingId)) || 'Created'})</span>
                </button>
              </div>
            ` : ''}
          </div>
        </td>

        <!-- 6. Actions (Wish / Greeting Card) -->
        <td class="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="openGreetingCardModal('${d.id}', '${item.eventType.toLowerCase()}')" class="p-1 text-violet-700 hover:bg-violet-50 rounded transition" title="Greeting Card">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </button>
          <button onclick="openWishesModal('${d.id}', '${item.eventType.toLowerCase()}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded text-xs transition shadow-xs">
            Wish
          </button>
        </td>
      </tr>
    `;
  }).join('');

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
  'Delhivery': 'https://www.delhivery.com/track',
  'Blue Dart': 'https://www.bluedart.com/tracking',
  'India Post': 'https://www.indiapost.gov.in/VAS/Pages/TrackConsignment.aspx',
  'DTDC': 'https://www.dtdc.in/tracking',
  'ISKCON Seva Courier': 'https://www.delhivery.com/track'
};

function getCourierTrackingUrl(courier, trackingNo) {
  const name = String(courier || '').trim().toLowerCase();
  for (const key in COURIER_TRACKING_PAGES) {
    if (name.includes(key.toLowerCase())) {
      return COURIER_TRACKING_PAGES[key];
    }
  }
  // Unknown courier — search the tracking number directly on Google
  if (trackingNo && trackingNo !== '—') {
    return `https://www.google.com/search?q=${encodeURIComponent(trackingNo)}`;
  }
  return 'https://www.delhivery.com/track';
}

function renderParcelsTable() {
  const tableBody = document.getElementById('parcels-table-body');
  if (!tableBody) return;

  const courierFilter = document.getElementById('parcel-filter-courier') ? document.getElementById('parcel-filter-courier').value : 'ALL';
  const search = document.getElementById('parcel-filter-search') ? document.getElementById('parcel-filter-search').value.toLowerCase().trim() : '';

  // Parcel Tracking lists ONLY live auto-synced parcel records — created from the
  // Birthday / Anniversary lists. No calendar-based filtering anymore.
  const parcels = state.parcels || [];

  const filtered = parcels.filter(p => {
    // 1. Courier Filter
    if (courierFilter !== 'ALL') {
      const courier = p.courierPartner || 'Delivery Courier';
      if (!courier.toLowerCase().includes(courierFilter.toLowerCase())) return false;
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
        <td colspan="7" class="text-center py-14 text-slate-400">
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
        <div class="text-[11px] text-slate-500">Logistics Hub: Sri Sri Radha Madhava Mandir, Durgapur</div>
      `;
    }
    updateParcelSelectAllCheckbox();
    updateParcelSelectedCountUI();
    return;
  }

  // Render Table Rows — every consignment shows the courier, the tracking number
  // (clickable → opens the courier's tracking page) and a Track action.
  tableBody.innerHTML = filtered.map(p => {
    // Merge the live parcel record over the devotee profile so every consignment
    // detail (courier, tracking no, parcel type) reflects the actual record.
    const devo = state.devotees.find(x => x.id === p.devoteeId) || {};
    const d = Object.assign({}, devo, p, { id: p.devoteeId, parcelCreated: true });
    const displayName = d.spiritualName || d.legalName;
    const secondaryName = d.spiritualName ? d.legalName : '';
    const trackingNoForDisplay = d.courierTrackingNo || '—';
    const courier = d.courierPartner || 'Delivery Courier';
    const pin = d.pincode || '713204';
    const city = d.city || 'Durgapur';

    const isVerified = (d.addressVerified === 'Verified' || (d.address && d.address.length >= 20));

    return `
      <tr id="parcel-row-${p.id}" class="hover:bg-slate-50/80 transition">
        <!-- 1. Purpose / Sent For -->
        <td class="py-3 px-3">
          <div class="flex items-center space-x-2.5">
            ${getDevoteeAvatarHtml(d, 'w-8 h-8', 'text-[10px]')}
            <div>
              <div class="font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition" onclick="viewDevoteeProfile('${d.id}')">${displayName}</div>
              <div class="text-[11px] text-slate-500">${secondaryName ? secondaryName + ' • ' : ''}${d.phone}</div>
            </div>
          </div>
          ${d.parcelType === 'Anniversary'
            ? '<div class="mt-1.5 inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] px-2 py-0.5 rounded-full">💍 Sent For: Anniversary</div>'
            : '<div class="mt-1.5 inline-flex items-center space-x-1 bg-pink-50 text-pink-700 border border-pink-200 font-bold text-[10px] px-2 py-0.5 rounded-full">🎂 Sent For: Birthday</div>'}
        </td>

        <!-- 2. Destination (full verified address) -->
        <td class="py-3 px-3 max-w-[220px]">
          <div class="font-medium text-slate-800 text-[11px] leading-snug">${d.address || ''}</div>
          <div class="flex items-center space-x-1 mt-0.5">
            <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i>
            <span class="font-mono font-bold text-slate-600 text-[10px]">${city} - ${pin}</span>
          </div>
        </td>

        <!-- 3. Verified Address (green block) -->
        <td class="py-3 px-3">
          ${isVerified
            ? '<div class="bg-emerald-50 border border-emerald-300/70 rounded-lg px-2.5 py-2 flex items-center space-x-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span class="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">✅ Verified Address</span></div>'
            : '<div class="bg-amber-50 border border-amber-300/70 rounded-lg px-2.5 py-2 flex items-center space-x-1.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span class="text-[10px] font-bold text-amber-700 uppercase tracking-wide">⚠️ Check Needed</span></div>'}
        </td>

        <!-- 4. Courier -->
        <td class="py-3 px-3">
          <span class="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 shadow-xs">
            <span>🚚</span>
            <span class="tracking-wide">${courier}</span>
          </span>
        </td>

        <!-- 5. Tracking Number (opens the courier's tracking page) -->
        <td class="py-3 px-3">
          <a href="${getCourierTrackingUrl(courier, trackingNoForDisplay)}" target="_blank" rel="noopener" title="Open the ${courier} tracking page in a new tab — check this number there" class="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1 inline-flex items-center space-x-1 hover:bg-indigo-100 hover:underline transition">
            <i data-lucide="external-link" class="w-3 h-3"></i>
            <span>${trackingNoForDisplay}</span>
          </a>
        </td>

        <!-- 6. Status (options removed — new ones will be added later) -->
        <td class="py-3 px-3">
          <span class="text-[11px] text-slate-400 font-medium" title="New parcel status options will be added shortly">—</span>
        </td>

        <!-- 7. Action (Track only) -->
        <td class="py-3 px-3 text-center">
          <button onclick="openParcelTrackerModal('${d.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center justify-center space-x-1 shadow-sm" title="View parcel tracking details">
            <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
            <span>Track</span>
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
      <div class="text-[11px] text-slate-500">Logistics Hub: Sri Sri Radha Madhava Mandir, Durgapur</div>
    `;
  }

  if (window.lucide) lucide.createIcons();
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

function bulkDeleteParcels() {
  if (!state.selectedParcels || state.selectedParcels.size === 0) {
    showToast('Please select at least one parcel record to delete', 'error');
    return;
  }

  const count = state.selectedParcels.size;
  if (!confirm(`Are you sure you want to permanently DELETE ${count} selected parcel record${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

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
  updateKPIs();
  renderDevoteesTable();
  renderBirthdaysGrid();
  renderParcelsTable();
  showToast(`Deleted ${count} parcel record${count > 1 ? 's' : ''} permanently`, 'success');
}

function deleteParcelRecord(parcelId, devoteeId) {
  if (!confirm('Permanently delete this parcel consignment? This cannot be undone.')) return;
  state.parcels = (state.parcels || []).filter(p => p.id !== parcelId);
  const dev = state.devotees.find(x => x.id === devoteeId);
  if (dev) clearDevoteeParcelTrace(dev);
  if (state.selectedParcels) state.selectedParcels.delete(parcelId);
  saveToStorage();
  updateKPIs();
  renderParcelsTable();
  renderBirthdaysGrid();
  renderDevoteesTable();
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
    if (d.addressVerified === 'Verified' || (d.address && d.address.length >= 20)) {
      addrBadge.className = 'bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full';
      addrBadge.innerText = 'Verified Address ✅';
    } else {
      addrBadge.className = 'bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full';
      addrBadge.innerText = 'Address Verification Needed ⚠️';
    }
  }

  // Fill Courier Details
  const courierNameEl = document.getElementById('pt-courier-name');
  if (courierNameEl) {
    courierNameEl.innerText = courier;
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
  const courier = d.courierPartner || 'DELIVERY COURIER';

  const slHeader = document.getElementById('sl-courier-header');
  if (slHeader) {
    slHeader.innerText = courier.toUpperCase();
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

function exportParcelManifestExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded', 'error');
    return;
  }

  const parcelRecords = state.parcels || [];
  if (parcelRecords.length === 0) {
    showToast('No parcels to export yet — create parcels from the Birthday / Anniversary lists.', 'info');
    return;
  }

  const data = parcelRecords.map(p => {
    const d = state.devotees.find(x => x.id === p.devoteeId) || {};
    return {
      'SL NO': d.slNo || '',
      'TRACKING ID': p.trackingId || '',
      'DEVOTEE ID': p.devoteeId,
      'RECIPIENT NAME': p.legalName || d.legalName,
      'SPIRITUAL NAME': p.spiritualName || d.spiritualName,
      'PHONE NUMBER': p.phone || d.phone,
      'DELIVERY ADDRESS': p.address || d.address,
      'CITY': p.city || d.city,
      'STATE': d.state || '',
      'PIN CODE': p.pincode || d.pincode,
      'PARCEL TYPE': p.parcelType || '',
      'COURIER PARTNER': p.courierPartner || 'Delivery Courier',
      'TRACKING NO': p.courierTrackingNo || p.trackingId,
      'STATUS': p.parcelStatusText || '',
      'ADDRESS VERIFIED': p.addressVerified || d.addressVerified,
      'PACKAGE CONTENTS': p.parcelDescription || d.packageContents,
      'WEIGHT (KG)': '0.45'
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Parcel Logistics Manifest');
  XLSX.writeFile(wb, `ISKCON_Devotee_Parcel_Manifest_${new Date().toISOString().split('T')[0]}.xlsx`);
  showToast('Exported Parcel Logistics Manifest successfully!', 'success');
}

// ----------------------------------------------------
// FESTIVE GREETING CARD GENERATOR
// ----------------------------------------------------
let activeGreetingDevotee = null;
let activeGreetingType = 'birthday';

function openGreetingCardModal(devoteeId, eventType = 'birthday') {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;

  activeGreetingDevotee = d;
  activeGreetingType = eventType;

  const displayName = d.spiritualName || d.legalName;
  const photoUrl = getDirectPhotoUrl(d.photo || d.photoDirect || d.cloudinaryPhoto, d);

  document.getElementById('gc-spiritual-name').innerText = displayName;
  document.getElementById('gc-legal-name').innerText = d.spiritualName ? `(${d.legalName})` : '';

  // Sri Sri Radha Madan Mohan image (kept in sync with the PNG download)
  const deityEl = document.getElementById('gc-deity-img');
  if (deityEl) deityEl.src = RADHA_MADAN_MOHAN_IMG;

  const imgEl = document.getElementById('gc-photo');
  if (imgEl) {
    if (photoUrl) {
      imgEl.src = photoUrl;
      imgEl.setAttribute('referrerpolicy', 'no-referrer');
      imgEl.style.display = 'block';
      imgEl.onerror = function() {
        this.style.display = 'none';
      };
    } else {
      imgEl.style.display = 'none';
    }
  }

  const titleEl = document.getElementById('gc-title');
  const dateEl = document.getElementById('gc-date-text');
  const quoteEl = document.getElementById('gc-blessing-quote');

  if (eventType === 'marriage') {
    titleEl.innerText = 'Happy Vivaha Anniversary!';
    const spouseText = d.spouseName ? `with ${d.spouseName}` : '';
    dateEl.innerText = `${d.anniversaryRaw || 'Sacred Wedding'} • ${spouseText}`;
    quoteEl.innerText = '"May Sri Sri Radha-Madhava and Lord Sri Chaitanya Mahaprabhu bless your Grihastha family with divine harmony, devotional peace, and eternal advancement in Krishna consciousness."';
  } else if (eventType === 'initiation') {
    titleEl.innerText = 'Happy Diksa Anniversary!';
    dateEl.innerText = `Spiritual Initiation • Disciple of ${d.guru || 'Guru Maharaj'}`;
    quoteEl.innerText = '"May you always remain situated under the divine lotus feet of your Spiritual Master and Guru Parampara, tasting the unlimited nectar of the Holy Names."';
  } else {
    titleEl.innerText = 'Happy Appearance Day!';
    const age = calculateAge(d.dob);
    dateEl.innerText = `${d.birthdayRaw || 'Auspicious Birthday'} • ${age > 0 ? 'Turning ' + age + ' Years' : 'Vyasa-puja Blessings'}`;
    quoteEl.innerText = '"May Sri Sri Radha-Madhava and Srila Prabhupada shower Their supreme mercy upon you with excellent health, long life, and endless taste for chanting the Maha-Mantra."';
  }

  document.getElementById('greeting-card-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openGenericGreetingCard() {
  if (state.devotees.length > 0) {
    openGreetingCardModal(state.devotees[0].id, 'birthday');
  }
}

function closeGreetingCardModal() {
  document.getElementById('greeting-card-modal').classList.add('hidden');
}

function copyGreetingCardText() {
  if (!activeGreetingDevotee) return;
  const d = activeGreetingDevotee;
  const name = d.spiritualName || d.legalName;
  const text = `Hare Krishna ${name}! 🙏\n\nAll glories to Srila Prabhupada! 🪷\n\nOn behalf of ISKCON Devotee Celebrations Department, we send you our warmest prayers and auspicious blessings on your special celebration!\n\n"May Sri Sri Radha-Madhava bless you with pure bhakti, divine health, and long life in Krishna's service."\n\nHare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare ✨`;
  copyToClipboard(text, 'Festive Wish Text copied to clipboard!');
}

function shareGreetingCardWhatsApp() {
  if (!activeGreetingDevotee) return;
  const d = activeGreetingDevotee;
  const phone = (d.whatsapp || d.phone || '').replace(/[^\d]/g, '');
  const name = d.spiritualName || d.legalName;
  const text = `Hare Krishna ${name}! 🙏\n\nPlease accept our humble obeisances. All glories to Srila Prabhupada! 🪷\n\nWishing you an auspicious and blissful Appearance Day / Anniversary from the ISKCON Devotee Celebrations Department! 🎉\n\nMay Sri Sri Radha-Madhava and Lord Gauranga shower Their unlimited mercy upon you with excellent health and pure devotion.\n\nHare Krishna Hare Krishna Krishna Krishna Hare Hare\nHare Rama Hare Rama Rama Rama Hare Hare ✨`;

  const cleanNum = phone.startsWith('91') ? phone : `91${phone}`;
  window.open(`https://wa.me/${cleanNum}?text=${encodeURIComponent(text)}`, '_blank');
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale, sh = dh / scale;
  const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function downloadGreetingCardPNG() {
  const canvas = document.getElementById('hidden-card-canvas');
  if (!canvas || !activeGreetingDevotee) return;

  const ctx = canvas.getContext('2d');
  const d = activeGreetingDevotee;
  const displayName = d.spiritualName || d.legalName;

  // Preload Sri Sri Radha Madan Mohan image (graceful fallback if it fails to load)
  const deityImage = await new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = RADHA_MADAN_MOHAN_IMG;
    setTimeout(() => resolve(null), 4000);
  });

  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 1000);
  grad.addColorStop(0, '#fffbeb');
  grad.addColorStop(0.5, '#fef3c7');
  grad.addColorStop(1, '#fde68a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 1000);

  // Ornate Border
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 14;
  ctx.strokeRect(20, 20, 960, 960);
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, 932, 932);

  // Header
  ctx.fillStyle = '#78350f';
  ctx.font = 'bold 23px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('INTERNATIONAL SOCIETY FOR KRISHNA CONSCIOUSNESS', 500, 78);

  ctx.fillStyle = '#b45309';
  ctx.font = 'italic 17px Georgia, serif';
  ctx.fillText('Founder-Acharya: His Divine Grace A.C. Bhaktivedanta Swami Prabhupada', 500, 110);

  ctx.fillStyle = '#991b1b';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('ISKCON DEVOTEE CELEBRATIONS DEPARTMENT', 500, 148);

  // Line
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(350, 168);
  ctx.lineTo(650, 168);
  ctx.stroke();

  // Sri Sri Radha Madan Mohan framed medallion
  const dx = 410, dy = 188, dw = 180, dh = 188;
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(dx, dy, dw, dh);
  if (deityImage) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(dx, dy, dw, dh, 22) : ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    drawImageCover(ctx, deityImage, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = '#d97706';
    ctx.font = '18px Georgia, serif';
    ctx.fillText('🪷', 500, 268);
  }
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 5;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 22); ctx.stroke(); }
  else { ctx.strokeRect(dx, dy, dw, dh); }
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(dx + 6, dy + 6, dw - 12, dh - 12, 16); ctx.stroke(); }

  // Caption under deity image
  ctx.fillStyle = '#7c2d12';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.fillText('Sri Sri Radha Madan Mohan', 500, 398);

  // Devotee Photo Circle Placeholder
  ctx.beginPath();
  ctx.arc(500, 480, 66, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '48px serif';
  ctx.fillText(d.gender === 'Female' ? '🌸' : '🪷', 500, 498);

  // Title
  ctx.fillStyle = '#991b1b';
  ctx.font = 'bold 42px Georgia, serif';
  const title = (activeGreetingType === 'marriage') ? 'Happy Vivaha Anniversary!' : 'Happy Appearance Day!';
  ctx.fillText(title, 500, 582);

  // Devotee Name Box
  ctx.fillStyle = '#ffffff';
  ctx.roundRect ? ctx.roundRect(150, 612, 700, 85, 16) : ctx.fillRect(150, 612, 700, 85);
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText(displayName, 500, 664);

  // Srila Prabhupada Blessing Quote
  ctx.fillStyle = '#451a03';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('"May Sri Sri Radha-Madhava bless you with excellent health, long life,', 500, 732);
  ctx.fillText('and pure unalloyed devotional service to the Vaishnavas."', 500, 764);

  // Maha-Mantra Box
  ctx.fillStyle = '#d97706';
  ctx.roundRect ? ctx.roundRect(100, 794, 800, 100, 16) : ctx.fillRect(100, 794, 800, 100);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 25px Georgia, serif';
  ctx.fillText('Hare Krishna Hare Krishna Krishna Krishna Hare Hare', 500, 837);
  ctx.fillText('Hare Rama Hare Rama Rama Rama Hare Hare', 500, 874);

  // Footer
  ctx.fillStyle = '#78350f';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.fillText('With Loving Vaishnava Prayers & Dandavat Pranams 🙏', 500, 946);

  // Trigger download
  const link = document.createElement('a');
  link.download = `ISKCON_Blessing_${(displayName).replace(/\s+/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Greeting Card downloaded successfully as PNG image!', 'success');
}

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

function openEditParcelModal(devoteeId) {
  const d = state.devotees.find(x => x.id === devoteeId);
  if (!d) return;
  const pRec = (state.parcels || []).find(x => x.devoteeId === devoteeId) || {};

  document.getElementById('ep-devotee-id').value = d.id;
  document.getElementById('ep-name').value = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
  document.getElementById('ep-address').value = pRec.address || d.address || '';
  document.getElementById('ep-city').value = pRec.city || d.city || 'Durgapur';
  document.getElementById('ep-pincode').value = pRec.pincode || d.pincode || '713204';
  document.getElementById('ep-address-verified').value = pRec.addressVerified || d.addressVerified || 'Verified';
  document.getElementById('ep-courier').value = pRec.courierPartner || d.courierPartner || 'Delivery Courier';
  document.getElementById('ep-tracking-no').value = pRec.courierTrackingNo || d.courierTrackingNo || '';

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

  d.address = document.getElementById('ep-address').value.trim();
  d.city = document.getElementById('ep-city').value.trim();
  d.pincode = document.getElementById('ep-pincode').value.trim();
  d.addressVerified = document.getElementById('ep-address-verified').value;
  d.courierPartner = document.getElementById('ep-courier').value;
  d.courierTrackingNo = document.getElementById('ep-tracking-no').value.trim();

  // Sync the edited details into the live parcel record too
  const pRec = (state.parcels || []).find(x => x.devoteeId === id);
  if (pRec) {
    pRec.address = d.address;
    pRec.city = d.city;
    pRec.pincode = d.pincode;
    pRec.addressVerified = d.addressVerified;
    pRec.courierPartner = d.courierPartner;
    pRec.courierTrackingNo = d.courierTrackingNo;
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
  const isCurrentlyVerified = (d.addressVerified === 'Verified' || (d.address && d.address.length >= 25 && d.addressVerified !== 'Needs Verification'));

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
  closeVerifyAddressModal();
  showToast(`Address for ${d.spiritualName || d.legalName} updated and marked as ✅ Verified!`, 'success');
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
  const displayName = d.spiritualName ? `${d.spiritualName} (${d.legalName})` : d.legalName;
  document.getElementById('cp-devotee-id').value = d.id;
  document.getElementById('cp-devotee-id-display').innerText = d.id;
  document.getElementById('cp-devotee-name').value = displayName;
  document.getElementById('cp-phone').value = d.phone || 'N/A';

  // Address
  document.getElementById('cp-address').value = d.address || '';
  document.getElementById('cp-city').value = d.city || 'Durgapur';
  document.getElementById('cp-pincode').value = d.pincode || '713204';

  // Address Verified Badge
  const addrBadge = document.getElementById('cp-address-verified-badge');
  if (addrBadge) {
    if (d.addressVerified === 'Verified' || (d.address && d.address.length >= 25)) {
      addrBadge.className = 'inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
      addrBadge.innerHTML = '<span>✅</span> <span>Verified Address</span>';
    } else {
      addrBadge.className = 'inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300';
      addrBadge.innerHTML = '<span>⚠️</span> <span>Will be Marked Verified on Dispatch</span>';
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
    parcelDescEl.value = d.parcelDescription || 'Sanctified Sri Sri Radha Madhava Maha-Prasadam Laddu, Tulasi Leaves, Sacred Kalash Blessings & Srimad Bhagavad-gita';
  }

  // Courier Company (locked to Delhivery)
  const courierEl = document.getElementById('cp-courier');
  if (courierEl) {
    courierEl.value = 'Delhivery';
  }

  // Tracking Number (always blank — added manually later)
  const trkEl = document.getElementById('cp-tracking-no');
  if (trkEl) {
    trkEl.value = '';
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
  const courier = document.getElementById('cp-courier').value;
  const trackingNo = document.getElementById('cp-tracking-no').value.trim();
  // Validate tracking number: if provided, must be exactly 13 digits (numbers only)
  if (trackingNo && !/^\d{13}$/.test(trackingNo)) {
    showToast('Tracking Number must be exactly 13 digits (numbers only)', 'error');
    return;
  }
  const bookingDate = document.getElementById('cp-booking-date').value;
  // Compute expected delivery (booking + 4 days) for tracking banner
  let expectedDeliveryDate = '';
  if (bookingDate) {
    const exp = new Date(bookingDate);
    exp.setDate(exp.getDate() + 4);
    expectedDeliveryDate = exp.toISOString().split('T')[0];
  }
  const remarks = document.getElementById('cp-remarks').value.trim();

  // Update devotee record with verified address and consignment details
  d.address = address;
  d.city = city;
  d.pincode = pincode;
  d.addressVerified = 'Verified';
  d.parcelCreated = true;
  d.hasParcel = true;
  d.parcelCreatedAt = new Date().toISOString();
  d.parcelType = parcelType;
  d.parcelDescription = parcelDescription;
  d.courierPartner = courier;
  d.courierTrackingNo = trackingNo;
  d.trackingId = trackingNo.startsWith('ISK') ? trackingNo : (d.trackingId || `ISK713204-${String(d.slNo || 1).padStart(3, '0')}`);
  d.bookingDate = bookingDate;
  d.expectedDeliveryDate = expectedDeliveryDate;
  d.remarks = remarks;

  // Manage in state.parcels array as well
  if (!state.parcels) state.parcels = [];
  const parcelRecord = {
    id: `PARCEL-${d.id}-${Date.now()}`,
    devoteeId: d.id,
    devoteeName: d.spiritualName || d.legalName,
    spiritualName: d.spiritualName || '',
    legalName: d.legalName || '',
    phone: d.phone,
    address: d.address,
    city: d.city,
    pincode: d.pincode,
    addressVerified: 'Verified',
    dob: d.dob,
    birthdayRaw: d.birthdayRaw,
    anniversaryDate: d.anniversaryDate,
    parcelType: parcelType,
    parcelDescription: parcelDescription,
    courierPartner: courier,
    courierTrackingNo: trackingNo,
    trackingId: d.trackingId,
    bookingDate: bookingDate,
    expectedDeliveryDate: expectedDeliveryDate,
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
    const row = document.getElementById(`parcel-row-${d.id}`);
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
  document.getElementById('wm-recipient').value = `${name} (${d.whatsapp || d.phone})`;

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
    const spouse = d.spouseName ? ` & ${d.spouseName}` : '';
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
  const phone = (activeWishesDevotee.whatsapp || activeWishesDevotee.phone || '').replace(/[^0-9]/g, '');
  const message = encodeURIComponent(document.getElementById('wm-message').value);

  if (!phone) {
    alert('No WhatsApp number provided for this devotee. You can copy the message and send manually.');
    return;
  }

  const url = `https://wa.me/${phone}?text=${message}`;
  window.open(url, '_blank');
}

// ----------------------------------------------------
// EXPORT & IMPORT (EXCEL / JSON)
// ----------------------------------------------------
function downloadJsonBackup() {
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
    'Courier Partner': d.courierPartner || 'Delivery Courier',
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

const exportFilteredDevoteesPDF = exportSelectedDevoteesPDF;

function exportFilteredDevoteesCSV() {
  const searchQuery = (document.getElementById('devotee-search')?.value || '').toLowerCase().trim();
  const filterCity = document.getElementById('filter-city')?.value || '';
  const filterMonth = document.getElementById('filter-month')?.value || '';

  const filtered = state.devotees.filter(d => {
    const matchesSearch = !searchQuery ||
      (d.legalName && d.legalName.toLowerCase().includes(searchQuery)) ||
      (d.spiritualName && d.spiritualName.toLowerCase().includes(searchQuery)) ||
      (d.phone && d.phone.toLowerCase().includes(searchQuery)) ||
      (d.city && d.city.toLowerCase().includes(searchQuery)) ||
      (d.address && d.address.toLowerCase().includes(searchQuery)) ||
      (d.pincode && d.pincode.toLowerCase().includes(searchQuery));

    const matchesCity = !filterCity || (d.city && d.city.toLowerCase() === filterCity.toLowerCase());

    let matchesMonth = true;
    if (filterMonth) {
      const monthNum = parseInt(filterMonth);
      const dobParts = parseDateParts(d.dob);
      const annivParts = parseDateParts(d.anniversaryDate || d.anniversaryRaw || d.anniversary);
      matchesMonth = (dobParts && (dobParts.month + 1) === monthNum) ||
                     (annivParts && (annivParts.month + 1) === monthNum);
    }

    return matchesSearch && matchesCity && matchesMonth;
  });

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
    return {
      'Event Type': item.label,
      'Spiritual Name': d.spiritualName || d.legalName,
      'Legal Name': d.legalName,
      'Event Date': item.date,
      'Celebration Milestone': item.milestone,
      'Spouse Name': item.spouse || (d.spouseName || ''),
      'Days Remaining': item.timing.daysRemaining,
      'Phone': d.phone,
      'WhatsApp': d.whatsapp,
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
  if (!state.selectedCelebrations || state.selectedCelebrations.size === 0) {
    showToast('Please select at least one devotee.', 'warning');
    alert('Please select at least one record.');
    return;
  }

  const eventType = state.celebrationEventType;
  const selected = getAllCelebrations()
    .filter(item => item.eventType === eventType && state.selectedCelebrations.has(item.devotee.id))
    .sort((a, b) => a.timing.daysRemaining - b.timing.daysRemaining);

  if (selected.length === 0) {
    showToast('No matching celebration records for the current tab.', 'warning');
    return;
  }

  const trHtml = selected.map((item, i) => {
    const d = item.devotee;
    const isVerified = (d.addressVerified === 'Verified' || (d.address && d.address.length >= 25 && d.addressVerified !== 'Needs Verification'));
    return `<tr>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px">${i + 1}</td>
      <td style="text-align:left;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px">${d.spiritualName || d.legalName}${d.spiritualName ? ` (${d.legalName})` : ''}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px">${item.date}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px">${d.phone || 'N/A'}</td>
      <td style="text-align:center;border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;font-weight:600;color:${isVerified ? '#047857' : '#b91c1c'}">${isVerified ? '🟢 Verified' : '🔴 Unverified'}</td>
    </tr>`;
  }).join('');

  const isAnniv = eventType === 'MARRIAGE';
  const titleLabel = isAnniv ? 'Vaishnava Vivaha Anniversaries' : 'Devotee Birthdays';
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
      <p class="sub-title">Selected ${titleLabel} — Address Verification Status</p>
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
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Date</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Phone</th>
        <th style="border:1px solid #cbd5e1;padding:6px 8px">Address Status</th>
      </tr>
    </thead>
    <tbody>${trHtml}</tbody>
  </table>
  <div class="footer">Sri Krishna Balaram Mandir, ISKCON Durgapur — For internal seva coordination only.</div>
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
      initApp();
      showToast(`Successfully imported ${importedCount} devotee records!`, 'success');
    } catch (err) {
      alert('Error parsing Excel file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function confirmResetToSampleData() {
  if (confirm('Load authentic ISKCON devotee sample data? Any unsaved local edits will be replaced.')) {
    const seed = getInitialSampleData();
    state.devotees = seed.devotees;
    state.counselors = seed.counselors;
    saveToStorage();
    initApp();
    showToast('Reset to authentic sample data!', 'success');
  }
}

function confirmClearDatabase() {
  if (confirm('WARNING: Are you sure you want to permanently clear the devotee database? Make sure you have exported a JSON backup first!')) {
    state.devotees = [];
    state.counselors = [];
    saveToStorage();
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
