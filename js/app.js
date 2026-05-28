/**
 * PUSHUP // 2000 — CORE APPLICATION ENGINE
 * 
 * Coordinates:
 * - State and Local Storage management.
 * - Single Page App (SPA) view routing and indicator animations.
 * - Dynamic circular SVG progress ring and linear bars.
 * - Interactive Calendar grid rendering and detail modals.
 * - Handcrafted cumulative SVG charting for target vs. actual lines.
 * - Streak, average, and milestone statistics engines.
 * - Import/Export and reset data utility handlers.
 * - Interactive Canvas-based neon particle celebration triggers.
 */

// ==========================================
// 1. APPLICATION STATE
// ==========================================
const state = {
    // Array of logged pushup sets: { id, date (YYYY-MM-DD), count, time (HH:MM AM/PM) }
    workouts: [],
    // Weekly rest day: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    restDay: 0,
    // Dictionary of monthly targets: { "YYYY-MM": { "YYYY-MM-DD": target } }
    schedules: {},
    // Currently viewed date in Calendar / Stats tabs
    currentMonthDate: new Date(),
    // Today's date string YYYY-MM-DD (local time)
    todayStr: '',
    // Active tab in navigation
    activeTab: 'dashboard',
    // Date string of currently selected day in modal
    selectedDayStr: null
};

// ==========================================
// 2. LIFECYCLE & INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTime();
    loadState();
    registerServiceWorker();
    initAppShell();
    renderDashboard();
});

// Setup today's static timestamp
function initTime() {
    const today = new Date();
    state.todayStr = formatDateString(today);
    state.currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
}

// Register service worker for installable PWA compliance
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('[PWA] Service Worker registered successfully:', reg.scope))
                .catch(err => console.error('[PWA] Service Worker registration failed:', err));
        });
    }

    // Monitor connectivity status
    window.addEventListener('online', updateOnlineBadge);
    window.addEventListener('offline', updateOnlineBadge);
    updateOnlineBadge();
}

function updateOnlineBadge() {
    const badge = document.getElementById('connection-badge');
    if (!badge) return;
    if (navigator.onLine) {
        badge.classList.remove('offline');
        badge.classList.add('online');
        badge.querySelector('.badge-label').textContent = 'OFFLINE READY';
    } else {
        badge.classList.remove('online');
        badge.classList.add('offline');
        badge.querySelector('.badge-label').textContent = 'WORKING OFFLINE';
    }
}

// Hydrate state from Local Storage
function loadState() {
    try {
        state.workouts = JSON.parse(localStorage.getItem('pushups_workouts')) || [];
        state.restDay = parseInt(localStorage.getItem('pushups_rest_day')) ?? 0;
        state.schedules = JSON.parse(localStorage.getItem('pushups_schedules')) || {};

        // Parse setting element to match state
        const selectEl = document.getElementById('setting-rest-day');
        if (selectEl) selectEl.value = state.restDay;

        // Ensure schedule for current month is initialized
        const monthKey = getMonthKey(state.currentMonthDate);
        if (!state.schedules[monthKey]) {
            const year = state.currentMonthDate.getFullYear();
            const month = state.currentMonthDate.getMonth();
            state.schedules[monthKey] = generateMonthlySchedule(year, month, state.restDay);
            saveState();
        }
    } catch (e) {
        console.error('Error loading state from localStorage:', e);
        // Fallback fallback
        state.workouts = [];
        state.restDay = 0;
        state.schedules = {};
    }
}

// Atomically save state to Local Storage
function saveState() {
    try {
        localStorage.setItem('pushups_workouts', JSON.stringify(state.workouts));
        localStorage.setItem('pushups_rest_day', state.restDay.toString());
        localStorage.setItem('pushups_schedules', JSON.stringify(state.schedules));
    } catch (e) {
        console.error('Error saving state to localStorage:', e);
    }
}

// Utility to get month key "YYYY-MM"
function getMonthKey(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}

// ==========================================
// 3. NAVIGATION & UI SHELL CONTROL
// ==========================================
function initAppShell() {
    const navItems = document.querySelectorAll('.nav-item');
    const indicator = document.getElementById('nav-indicator');

    // Tab Switching click logic
    navItems.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName, index);
        });
    });

    // Synchronize slider handles
    const mainSlider = document.getElementById('pushup-slider');
    const mainSliderVal = document.getElementById('slider-current-val');
    if (mainSlider && mainSliderVal) {
        mainSlider.addEventListener('input', (e) => {
            mainSliderVal.textContent = e.target.value;
        });
    }

    const modalSlider = document.getElementById('modal-pushup-slider');
    const modalSliderVal = document.getElementById('modal-slider-current-val');
    if (modalSlider && modalSliderVal) {
        modalSlider.addEventListener('input', (e) => {
            modalSliderVal.textContent = e.target.value;
        });
    }

    // Set Log Actions
    const mainSubmit = document.getElementById('log-submit-btn');
    if (mainSubmit) {
        mainSubmit.addEventListener('click', () => {
            const val = parseInt(mainSlider.value);
            logPushups(state.todayStr, val);
        });
    }

    // Quick pills tap log
    const quickPills = document.querySelectorAll('.quick-pills .pill-btn');
    quickPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const val = parseInt(pill.getAttribute('data-value'));
            if (mainSlider) {
                mainSlider.value = val;
                mainSliderVal.textContent = val;
            }
        });
    });

    // Calendar month incrementors
    document.getElementById('prev-month-btn')?.addEventListener('click', () => shiftCalendarMonth(-1));
    document.getElementById('next-month-btn')?.addEventListener('click', () => shiftCalendarMonth(1));

    // Modal dismiss hooks
    document.getElementById('modal-close-btn')?.addEventListener('click', closeDayModal);
    document.getElementById('day-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'day-modal') closeDayModal();
    });

    // Modal submit log hook
    document.getElementById('modal-log-btn')?.addEventListener('click', () => {
        const val = parseInt(modalSlider.value);
        logPushups(state.selectedDayStr, val);
        openDayModal(state.selectedDayStr); // Refresh modal view
    });

    // Preferences rest day toggle
    document.getElementById('setting-rest-day')?.addEventListener('click', (e) => {
        // Handle dropdown updates
        const newVal = parseInt(e.target.value);
        if (newVal !== state.restDay) {
            updateRestDaySetting(newVal);
        }
    });

    // Data backups trigger
    document.getElementById('btn-export-data')?.addEventListener('click', exportDataBackup);
    document.getElementById('btn-import-data')?.addEventListener('click', () => {
        document.getElementById('import-file-input')?.click();
    });
    document.getElementById('import-file-input')?.addEventListener('change', importDataBackup);
    document.getElementById('btn-reset-data')?.addEventListener('click', resetAllAppData);
}

function switchTab(tabName, index) {
    if (state.activeTab === tabName) return;

    // Manage DOM display views
    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    
    if (targetTab) targetTab.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    // Slide indicator micro-animation
    const indicator = document.getElementById('nav-indicator');
    if (indicator) {
        indicator.style.transform = `translateX(${index * 100}%)`;
    }

    state.activeTab = tabName;

    // Trigger tab specific loads
    if (tabName === 'dashboard') renderDashboard();
    else if (tabName === 'calendar') renderCalendar();
    else if (tabName === 'stats') renderStats();
}

// ==========================================
// 4. CORE LOGGER ACTIONS
// ==========================================
function logPushups(dateStr, count) {
    if (isNaN(count) || count <= 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Identify if target already met prior to log (to trigger celebration)
    const target = getDayTarget(dateStr);
    const prevCompleted = sumPushupsOnDate(dateStr);

    const newSet = {
        id: `set-${Date.now()}`,
        date: dateStr,
        count: count,
        time: timeStr
    };

    state.workouts.push(newSet);
    saveState();

    const newCompleted = prevCompleted + count;

    // Visual Feedback: Trigger Confetti if target met exactly on this log!
    if (prevCompleted < target && newCompleted >= target && target > 0) {
        triggerCelebration();
    }

    // Refresh active views
    if (state.activeTab === 'dashboard') {
        renderDashboard();
    } else if (state.activeTab === 'calendar') {
        renderCalendar();
    }

    // Ripple feedback (haptic simulate)
    if ('vibrate' in navigator) {
        navigator.vibrate([40, 20, 40]);
    }
}

function deleteSet(setId) {
    state.workouts = state.workouts.filter(set => set.id !== setId);
    saveState();

    if (state.activeTab === 'dashboard') {
        renderDashboard();
    } else if (state.selectedDayStr) {
        openDayModal(state.selectedDayStr); // Refresh modal sets list
    }
}

// Helpers to sum workouts on specific days
function sumPushupsOnDate(dateStr) {
    return state.workouts
        .filter(set => set.date === dateStr)
        .reduce((sum, set) => sum + set.count, 0);
}

function getDayTarget(dateStr) {
    const yearMonth = dateStr.substring(0, 7);
    const monthSchedule = state.schedules[yearMonth];
    return monthSchedule ? (monthSchedule[dateStr] ?? 0) : 0;
}

// ==========================================
// 5. DASHBOARD VIEW RENDERER
// ==========================================
function renderDashboard() {
    const target = getDayTarget(state.todayStr);
    const completed = sumPushupsOnDate(state.todayStr);
    const progressPct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : (target === 0 && completed > 0 ? 100 : 0);

    // 1. Update circular SVG progress fill
    const fillRing = document.querySelector('.progress-ring-fill');
    if (fillRing) {
        const circumference = 596.9; // 2 * PI * 95
        const offset = circumference - (Math.min(1, target > 0 ? completed / target : 0) * circumference);
        fillRing.style.strokeDashoffset = offset;
    }

    // 2. Update dashboard numeric readings
    document.getElementById('dash-percentage').textContent = `${progressPct}%`;
    document.getElementById('dash-nums').textContent = `${completed} / ${target}`;

    const labelVal = document.querySelector('.progress-ring-text .label-val');
    if (labelVal) {
        if (target === 0) {
            labelVal.textContent = 'REST DAY';
            document.getElementById('dash-nums').textContent = completed > 0 ? `${completed} extra` : '0';
        } else {
            labelVal.textContent = 'PUSHUPS TODAY';
        }
    }

    // 3. Update active streak values
    const streak = calculateStreak();
    document.getElementById('dash-streak-txt').textContent = `${streak} DAY ${streak === 1 ? 'STREAK' : 'STREAK'}`;
    const streakBanner = document.getElementById('dash-streak-banner');
    if (streakBanner) {
        streakBanner.style.display = streak > 0 ? 'flex' : 'none';
    }

    // 4. Render today's logged sets list
    const setsList = document.getElementById('today-sets-list');
    const todaySets = state.workouts.filter(set => set.date === state.todayStr);
    
    document.getElementById('today-sets-count').textContent = `${todaySets.length} set${todaySets.length === 1 ? '' : 's'}`;

    if (todaySets.length === 0) {
        setsList.innerHTML = `
            <div class="empty-state">
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
              <p>No sets logged today. Slide and tap record to start!</p>
            </div>
        `;
    } else {
        // Render sets in reverse chronological order
        setsList.innerHTML = todaySets.map(set => `
            <div class="set-item" data-id="${set.id}">
              <div class="set-left">
                <div class="set-badge-icon">
                  <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </div>
                <div class="set-info">
                  <span class="set-count">${set.count} pushups</span>
                  <span class="set-time">${set.time}</span>
                </div>
              </div>
              <button class="set-delete-btn" onclick="deleteSet('${set.id}')">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
        `).join('');
    }
}

// ==========================================
// 6. CALENDAR VIEW RENDERER
// ==========================================
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-title');
    if (!grid || !title) return;

    grid.innerHTML = '';
    const year = state.currentMonthDate.getFullYear();
    const month = state.currentMonthDate.getMonth();
    const monthKey = getMonthKey(state.currentMonthDate);

    // Sync header title (e.g. MAY 2026)
    const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    title.textContent = `${monthNames[month]} ${year}`;

    // Get schedules (or generate if browsed to new month)
    if (!state.schedules[monthKey]) {
        state.schedules[monthKey] = generateMonthlySchedule(year, month, state.restDay);
        saveState();
    }
    const monthSchedule = state.schedules[monthKey];

    // Determine calendar date layouts
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first weekday of first day
    const firstDayIndex = new Date(year, month, 1).getDay();
    const gridPaddingDays = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Render calendar padding days
    for (let i = 0; i < gridPaddingDays; i++) {
        const padTile = document.createElement('div');
        padTile.className = 'cal-day empty-day';
        grid.appendChild(padTile);
    }

    // Render month day tiles
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = formatDateString(date);
        const target = monthSchedule[dateStr] ?? 0;
        const completed = sumPushupsOnDate(dateStr);

        const tile = document.createElement('div');
        tile.className = 'cal-day';
        tile.setAttribute('data-date', dateStr);

        // Compute Tile classes based on dates
        if (dateStr === state.todayStr) {
            tile.classList.add('day-today');
        }

        if (dateStr > state.todayStr) {
            tile.classList.add('day-future');
        }

        if (target === 0) {
            tile.classList.add('day-rest');
        } else if (completed >= target) {
            tile.classList.add('day-completed');
        } else if (completed > 0) {
            tile.classList.add('day-pending');
        } else if (dateStr < state.todayStr) {
            tile.classList.add('day-missed');
        }

        // Inside tile structure
        tile.innerHTML = `
            <span class="cal-day-num">${d}</span>
            <span class="cal-day-target">${target > 0 ? target : ''}</span>
        `;

        tile.addEventListener('click', () => openDayModal(dateStr));
        grid.appendChild(tile);
    }
}

function shiftCalendarMonth(direction) {
    state.currentMonthDate.setMonth(state.currentMonthDate.getMonth() + direction);
    renderCalendar();
}

// ==========================================
// 7. INTERACTIVE DETAIL MODAL
// ==========================================
function openDayModal(dateStr) {
    state.selectedDayStr = dateStr;
    const modal = document.getElementById('day-modal');
    if (!modal) return;

    const target = getDayTarget(dateStr);
    const completed = sumPushupsOnDate(dateStr);

    // Format title date (e.g. May 15, 2026)
    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', options);
    document.getElementById('modal-date-title').textContent = formattedDate;

    // Modal targets display
    document.getElementById('modal-target-val').textContent = target;
    document.getElementById('modal-completed-val').textContent = completed;

    // Compute status badge
    const badge = document.getElementById('modal-status-badge');
    badge.className = 'badge-status';
    if (target === 0) {
        badge.classList.add('rest');
        badge.textContent = 'REST DAY';
    } else if (completed >= target) {
        badge.classList.add('completed');
        badge.textContent = 'COMPLETED';
    } else if (completed > 0) {
        badge.classList.add('pending');
        badge.textContent = 'IN PROGRESS';
    } else if (dateStr < state.todayStr) {
        badge.classList.add('missed');
        badge.textContent = 'MISSED GOAL';
    } else {
        badge.classList.add('pending');
        badge.textContent = 'PENDING';
    }

    // Modal slider logic setup
    const slider = document.getElementById('modal-pushup-slider');
    const sliderVal = document.getElementById('modal-slider-current-val');
    if (slider && sliderVal) {
        slider.value = 20;
        sliderVal.textContent = 20;
    }

    // Render modal sets list
    const modalList = document.getElementById('modal-sets-list');
    const daySets = state.workouts.filter(set => set.date === dateStr);

    if (daySets.length === 0) {
        modalList.innerHTML = `<div class="empty-state" style="padding: 15px;"><p>No pushups recorded for this day.</p></div>`;
    } else {
        modalList.innerHTML = daySets.map(set => `
            <div class="set-item">
              <div class="set-left">
                <div class="set-badge-icon">
                  <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </div>
                <div class="set-info">
                  <span class="set-count" style="font-size:0.9rem">${set.count} pushups</span>
                  <span class="set-time" style="font-size:0.65rem">${set.time}</span>
                </div>
              </div>
              <button class="set-delete-btn" onclick="deleteSet('${set.id}')">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
        `).join('');
    }

    modal.classList.add('active');
}

function closeDayModal() {
    const modal = document.getElementById('day-modal');
    if (modal) modal.classList.remove('active');
    state.selectedDayStr = null;

    // Refresh states
    if (state.activeTab === 'calendar') renderCalendar();
    else if (state.activeTab === 'dashboard') renderDashboard();
}

// ==========================================
// 8. STATS VIEW & SVG CHARTING RENDERERS
// ==========================================
function renderStats() {
    const monthKey = getMonthKey(state.currentMonthDate);
    const monthSchedule = state.schedules[monthKey] || {};
    
    // Sum total completed this month
    const monthWorkouts = state.workouts.filter(set => set.date.substring(0, 7) === monthKey);
    const totalDone = monthWorkouts.reduce((sum, set) => sum + set.count, 0);

    // 1. Update Goal Summary Cards
    document.getElementById('stats-total-done').textContent = totalDone;
    const progressPct = Math.min(100, Math.round((totalDone / 2000) * 100));
    document.getElementById('stats-completion-rate').textContent = `${progressPct}% Complete`;
    document.getElementById('stats-pushups-left').textContent = `${Math.max(0, 2000 - totalDone)} left`;
    document.getElementById('stats-progress-bar-fill').style.width = `${progressPct}%`;

    // Calculate days remaining
    const year = state.currentMonthDate.getFullYear();
    const month = state.currentMonthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    let daysLeft = 0;
    if (today.getFullYear() === year && today.getMonth() === month) {
        daysLeft = daysInMonth - today.getDate();
    } else if (new Date(year, month, 1) > today) {
        daysLeft = daysInMonth;
    }
    document.getElementById('stats-days-left').textContent = `${daysLeft} calendar day${daysLeft === 1 ? '' : 's'} remaining this month`;

    // 2. Streaks, Averages, and count statistics
    const currentStreak = calculateStreak();
    const bestStreak = calculateBestStreak();
    document.getElementById('stat-current-streak').textContent = currentStreak;
    document.getElementById('stat-max-streak').textContent = bestStreak;

    // Count Active Days targets
    const activeDaysKeys = Object.keys(monthSchedule).filter(k => monthSchedule[k] > 0);
    const M_active = activeDaysKeys.length;
    const avgPushups = M_active > 0 ? Math.round(totalDone / M_active) : 0;
    document.getElementById('stat-daily-average').textContent = avgPushups;

    // Count Rest Days spent
    const spentRestDays = Object.keys(monthSchedule).filter(dateStr => {
        return monthSchedule[dateStr] === 0 && dateStr <= state.todayStr && dateStr.substring(0, 7) === monthKey;
    }).length;
    document.getElementById('stat-rest-days').textContent = spentRestDays;

    // 3. Render glowing SVG cumulative charts
    renderSVGChart(year, month, monthSchedule);
}

// Handcrafted SVG Chart Drawing Engine
function renderSVGChart(year, month, schedule) {
    const wrapper = document.getElementById('svg-chart-wrapper');
    if (!wrapper) return;
    
    wrapper.innerHTML = '';
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Get cumulative values
    const targetPoints = [];
    const actualPoints = [];
    
    let cumulativeTarget = 0;
    let cumulativeActual = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
        
        cumulativeTarget += schedule[dateStr] || 0;
        targetPoints.push({ x: d, y: cumulativeTarget });

        if (dateStr <= state.todayStr) {
            cumulativeActual += sumPushupsOnDate(dateStr);
            actualPoints.push({ x: d, y: cumulativeActual });
        }
    }

    // Chart Dimensions
    const width = wrapper.clientWidth || 380;
    const height = 180;
    const paddingLeft = 35;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 20;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Max values (usually 2000, but can go higher if users exceed)
    const maxY = Math.max(2000, cumulativeActual);

    // Coord Mappers
    const mapX = (day) => paddingLeft + ((day - 1) / (daysInMonth - 1)) * chartWidth;
    const mapY = (val) => paddingTop + chartHeight - (val / maxY) * chartHeight;

    // Draw SVG Root
    let svgHtml = `<svg width="${width}" height="${height}" style="overflow: visible;">`;
    
    // Draw Glowing Filters
    svgHtml += `
      <defs>
        <filter id="violet-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="pink-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    `;

    // Draw Grid Lines (Y-Axis guides)
    const guides = [0, 500, 1000, 1500, 2000];
    guides.forEach(g => {
        const yPos = mapY(g);
        svgHtml += `<line x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />`;
        svgHtml += `<text x="${paddingLeft - 8}" y="${yPos + 4}" fill="var(--text-dimmed)" font-size="9" font-weight="600" text-anchor="end">${g}</text>`;
    });

    // Draw X-Axis Day markings (1, 10, 20, End)
    const dayMarks = [1, 10, 20, daysInMonth];
    dayMarks.forEach(d => {
        const xPos = mapX(d);
        svgHtml += `<text x="${xPos}" y="${height - 2}" fill="var(--text-dimmed)" font-size="9" font-weight="600" text-anchor="middle">Day ${d}</text>`;
    });

    // Draw Target Curve Line
    let targetPath = '';
    targetPoints.forEach((p, idx) => {
        const px = mapX(p.x);
        const py = mapY(p.y);
        if (idx === 0) targetPath += `M ${px} ${py}`;
        else targetPath += ` L ${px} ${py}`;
    });
    svgHtml += `<path d="${targetPath}" fill="none" stroke="var(--accent-pink)" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.75" />`;

    // Draw Actual Progress Line
    if (actualPoints.length > 0) {
        let actualPath = '';
        actualPoints.forEach((p, idx) => {
            const px = mapX(p.x);
            const py = mapY(p.y);
            if (idx === 0) actualPath += `M ${px} ${py}`;
            else actualPath += ` L ${px} ${py}`;
        });
        svgHtml += `<path d="${actualPath}" fill="none" stroke="var(--accent-violet)" stroke-width="3" filter="url(#violet-glow)" stroke-linecap="round" />`;
        
        // Draw pulse dot at current day
        const currentPt = actualPoints[actualPoints.length - 1];
        const cx = mapX(currentPt.x);
        const cy = mapY(currentPt.y);
        svgHtml += `<circle cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="var(--accent-violet)" stroke-width="2" filter="url(#violet-glow)" />`;
    }

    svgHtml += `</svg>`;
    wrapper.innerHTML = svgHtml;
}

// ==========================================
// 9. SETTINGS & APP PREFERENCES UTILS
// ==========================================
function updateRestDaySetting(newVal) {
    state.restDay = newVal;
    saveState();

    const monthKey = getMonthKey(state.todayStr);
    const currentSchedule = state.schedules[monthKey];
    
    if (currentSchedule) {
        // Run mid-month adaptive redistribution algorithm!
        const year = state.currentMonthDate.getFullYear();
        const month = state.currentMonthDate.getMonth();
        state.schedules[monthKey] = redistributeFutureSchedule(year, month, currentSchedule, newVal, state.todayStr);
        saveState();
        
        alert("Rest day updated! Future days have been recalculated to ensure you still hit exactly 2000 pushups this month!");
    }
}

// Export data backup as JSON download
function exportDataBackup() {
    const dataStr = JSON.stringify({
        workouts: state.workouts,
        restDay: state.restDay,
        schedules: state.schedules
    }, null, 2);

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pushup_tracker_backup_${state.todayStr}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
}

// Import data backups from JSON uploads
function importDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.workouts) {
                alert("Invalid backup format!");
                return;
            }

            // Merge sets securely (preventing double entries)
            const workoutIds = new Set(state.workouts.map(w => w.id));
            imported.workouts.forEach(set => {
                if (!workoutIds.has(set.id)) {
                    state.workouts.push(set);
                }
            });

            // Restore preferences
            if (imported.restDay !== undefined) {
                state.restDay = imported.restDay;
                const selectEl = document.getElementById('setting-rest-day');
                if (selectEl) selectEl.value = state.restDay;
            }

            // Merge schedules
            if (imported.schedules) {
                state.schedules = { ...state.schedules, ...imported.schedules };
            }

            saveState();
            alert("Backup data restored successfully!");
            
            // Re-render
            initTime();
            renderDashboard();
        } catch (err) {
            console.error(err);
            alert("Error parsing backup file!");
        }
    };
    reader.readAsText(file);
}

// Full app storage reset
function resetAllAppData() {
    const confirm1 = confirm("Are you absolutely sure you want to delete all pushup records? This cannot be undone!");
    if (!confirm1) return;
    const confirm2 = confirm("Double verification: Confirm one more time to WIPE all storage records.");
    if (!confirm2) return;

    localStorage.removeItem('pushups_workouts');
    localStorage.removeItem('pushups_rest_day');
    localStorage.removeItem('pushups_schedules');

    state.workouts = [];
    state.restDay = 0;
    state.schedules = {};

    initTime();
    loadState();
    
    alert("Application data fully reset.");
    switchTab('dashboard', 0);
}

// ==========================================
// 10. STATISTICS CALCULATION MODULES
// ==========================================

// Calculates consecutive active days where workout target met
function calculateStreak() {
    const monthKey = getMonthKey(new Date());
    const monthSchedule = state.schedules[monthKey];
    if (!monthSchedule) return 0;

    let streak = 0;
    let checkDate = new Date(); // Start evaluating from today

    while (true) {
        const dateStr = formatDateString(checkDate);
        const target = monthSchedule[dateStr];
        
        // If we go out of bounds of the current schedule, stop
        if (target === undefined) break;

        const completed = sumPushupsOnDate(dateStr);

        if (target === 0) {
            // Rest Day: streak is preserved, just skip checking it
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }

        if (completed >= target) {
            streak++;
        } else {
            // Today could be incomplete yet, but if yesterday was complete, streak is active
            if (dateStr === state.todayStr && completed < target) {
                // Skip today but check yesterday
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            break; // Streak broken
        }

        checkDate.setDate(checkDate.getDate() - 1);
    }

    return streak;
}

// Calculates longest meeting-streak of all records
function calculateBestStreak() {
    // Sort all unique days with recorded sets or completed goals
    const allWorkoutDates = [...new Set(state.workouts.map(w => w.date))].sort();
    if (allWorkoutDates.length === 0) return 0;

    let maxStreak = 0;
    let currentStreak = 0;
    
    // Evaluate streaks on a consecutive days calendar crawl
    const start = new Date(allWorkoutDates[0]);
    const end = new Date();
    
    let check = new Date(start);
    while (check <= end) {
        const dateStr = formatDateString(check);
        const target = getDayTarget(dateStr);
        const completed = sumPushupsOnDate(dateStr);

        if (target === 0) {
            // Rest days preserve the streak, do not count as +1 but do not break it
            check.setDate(check.getDate() + 1);
            continue;
        }

        if (completed >= target && target > 0) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 0;
        }

        check.setDate(check.getDate() + 1);
    }

    return maxStreak;
}

// ==========================================
// 11. NEON CANVAS CONFETTI PARTICLE SYSTEM
// ==========================================
function triggerCelebration() {
    const canvas = document.getElementById('celebration-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ffffff'];

    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * -100 - 20;
            this.radius = Math.random() * 6 + 3;
            this.color = colors[Math.floor(Math.random() * colors.length)];
            this.speedY = Math.random() * 3 + 4;
            this.speedX = Math.random() * 2 - 1;
            this.rotation = Math.random() * 360;
            this.rotationSpeed = Math.random() * 4 - 2;
            this.opacity = 1;
        }

        update() {
            this.y += this.speedY;
            this.x += this.speedX;
            this.rotation += this.rotationSpeed;
            if (this.y > canvas.height - 20) {
                this.opacity -= 0.02;
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((this.rotation * Math.PI) / 180);
            ctx.globalAlpha = this.opacity;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10; // Glowing particle drops!
            
            // Draw squarish confetti particles
            ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 1.2);
            ctx.restore();
        }
    }

    // Populate particles
    for (let i = 0; i < 150; i++) {
        particles.push(new Particle());
    }

    let animationFrameId;
    const startTime = Date.now();

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Loop backwards to splice safely
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update();
            p.draw();

            if (p.opacity <= 0 || p.y > canvas.height) {
                particles.splice(i, 1);
            }
        }

        if (particles.length > 0 && Date.now() - startTime < 4000) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cancelAnimationFrame(animationFrameId);
        }
    }

    animate();
}

// Quick window resizing responsiveness for Canvas and Charting
window.addEventListener('resize', () => {
    const canvas = document.getElementById('celebration-canvas');
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    if (state.activeTab === 'stats') {
        renderStats();
    }
});
