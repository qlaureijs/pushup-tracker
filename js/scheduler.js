/**
 * Pushup Tracker Scheduler Module
 * 
 * Generates and adapts the monthly target schedule:
 * - Total target: 2000 pushups per calendar month.
 * - Rest days: Exactly 1 designated rest day per week (default Sunday, 0 pushups).
 * - Active days: Pushup targets vary between 30 and 200, strictly in multiples of 5.
 * - Offline/History Friendly: Logic to recalculate future targets while preserving past targets and logged sets.
 */

/**
 * Format a Date object to YYYY-MM-DD string in local time.
 * @param {Date} date 
 * @returns {string} YYYY-MM-DD
 */
function formatDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generate a new schedule for a given year and month.
 * @param {number} year - Calendar year (e.g., 2026)
 * @param {number} month - JS 0-indexed month (0 = January, 11 = December)
 * @param {number} restDayOfWeek - Weekly rest day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * @returns {Object} Target map { "YYYY-MM-DD": target_number }
 */
function generateMonthlySchedule(year, month, restDayOfWeek = 0) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const schedule = {};
    const days = [];

    // 1. Identify all days in the month and mark rest days
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = formatDateString(date);
        const isRestDay = date.getDay() === restDayOfWeek;
        days.push({
            dateStr,
            isRestDay,
            target: 0
        });
    }

    const activeDays = days.filter(day => !day.isRestDay);
    const M = activeDays.length;

    if (M === 0) {
        // Fallback in case of extreme/corrupt parameters (e.g., month with no days, which is impossible)
        days.forEach(day => {
            schedule[day.dateStr] = 0;
        });
        return schedule;
    }

    // 2. Distribute 2000 pushups across active days in multiples of 5
    // Each active day starts with a minimum target of 30 pushups
    const baseTarget = 30;
    activeDays.forEach(day => {
        day.target = baseTarget;
    });

    let remainingPushups = 2000 - (baseTarget * M);
    let increments = Math.floor(remainingPushups / 5);

    // Distribute increments of 5 randomly to active days, capping at 200
    const maxTarget = 200;
    while (increments > 0) {
        const eligibleDays = activeDays.filter(day => day.target < maxTarget);
        if (eligibleDays.length === 0) {
            // If all days hit max target, distribute remaining to any day (should not happen for 2000 total)
            break;
        }
        const randomIndex = Math.floor(Math.random() * eligibleDays.length);
        eligibleDays[randomIndex].target += 5;
        increments--;
    }

    // 3. Construct the final schedule map
    days.forEach(day => {
        schedule[day.dateStr] = day.target;
    });

    return schedule;
}

/**
 * Redistribute future targets when the rest day changes mid-month,
 * ensuring total monthly target remains exactly 2000 pushups.
 * 
 * @param {number} year - Calendar year
 * @param {number} month - JS 0-indexed month
 * @param {Object} currentSchedule - Current target map { "YYYY-MM-DD": target }
 * @param {number} newRestDayOfWeek - New weekly rest day (0 = Sunday, 1 = Monday, etc.)
 * @param {string} todayDateStr - Today's date in "YYYY-MM-DD" format
 * @returns {Object} New target map { "YYYY-MM-DD": target }
 */
function redistributeFutureSchedule(year, month, currentSchedule, newRestDayOfWeek, todayDateStr) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const newSchedule = { ...currentSchedule };
    const futureDays = [];
    let pastTargetSum = 0;

    // 1. Separate days into past (fixed) and future (adjustable)
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = formatDateString(date);
        
        if (dateStr < todayDateStr) {
            // Past day: Keep target as is
            pastTargetSum += currentSchedule[dateStr] || 0;
        } else {
            // Future or current day: Mark for adjustment
            const isRestDay = date.getDay() === newRestDayOfWeek;
            futureDays.push({
                dateStr,
                isRestDay,
                target: 0
            });
        }
    }

    const futureActiveDays = futureDays.filter(day => !day.isRestDay);
    const M_future = futureActiveDays.length;

    // 2. Calculate remaining pushups to allocate
    let remainingPushups = 2000 - pastTargetSum;

    // If remaining pushups is negative (e.g. user already completed > 2000 in the past),
    // then set all future days to 0 and finish.
    if (remainingPushups <= 0) {
        futureDays.forEach(day => {
            newSchedule[day.dateStr] = 0;
        });
        return newSchedule;
    }

    if (M_future === 0) {
        // If there are no future active days left, assign remaining to today if active, else 0
        futureDays.forEach(day => {
            newSchedule[day.dateStr] = 0;
        });
        return newSchedule;
    }

    // 3. Define target constraints adaptively
    let minTarget = 30;
    let maxTarget = 200;

    // Boundary checks: adjust limits if remaining pushups cannot fit within standard [30, 200] limits
    if (remainingPushups < minTarget * M_future) {
        // Not enough pushups left to maintain 30/day minimum
        minTarget = Math.max(0, Math.floor(remainingPushups / M_future / 5) * 5);
        if (minTarget === 0 && remainingPushups > 0) {
            minTarget = 5; // try to keep a small positive target if possible
        }
    } else if (remainingPushups > maxTarget * M_future) {
        // Too many pushups left to stay under 200/day maximum
        maxTarget = Math.ceil(remainingPushups / M_future / 5) * 5;
    }

    // Set baseline target for all active future days
    futureActiveDays.forEach(day => {
        day.target = minTarget;
    });

    let extraPushups = remainingPushups - (minTarget * M_future);
    // Round to nearest multiple of 5 for safety, though it should already be aligned
    extraPushups = Math.max(0, Math.floor(extraPushups / 5) * 5);
    let increments = extraPushups / 5;

    // 4. Distribute remaining increments to future active days
    while (increments > 0) {
        const eligibleDays = futureActiveDays.filter(day => day.target < maxTarget);
        if (eligibleDays.length === 0) {
            // Fallback: add to any active future day
            break;
        }
        const randomIndex = Math.floor(Math.random() * eligibleDays.length);
        eligibleDays[randomIndex].target += 5;
        increments--;
    }

    // If there is still a small remainder (due to float rounding or minimum restrictions),
    // force-add it to the first eligible active future day
    let finalSum = pastTargetSum + futureDays.reduce((sum, day) => sum + day.target, 0);
    let error = 2000 - finalSum;
    if (error !== 0 && futureActiveDays.length > 0) {
        const adjustment = Math.floor(error / 5) * 5;
        futureActiveDays[0].target += adjustment;
    }

    // 5. Merge future days back into the target schedule
    futureDays.forEach(day => {
        newSchedule[day.dateStr] = day.target;
    });

    return newSchedule;
}

// Export functions for browser and test environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateMonthlySchedule,
        redistributeFutureSchedule,
        formatDateString
    };
}
