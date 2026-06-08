export function resolveLocale(language) {
  if (!language) return 'en';
  const normalized = String(language).trim().toLowerCase();
  if (['he', 'hebrew', 'עברית', 'iw'].includes(normalized)) return 'he';
  if (['ar', 'arabic', 'العربية'].includes(normalized)) return 'ar';
  if (['ru', 'russian', 'русский'].includes(normalized)) return 'ru';
  if (['en', 'english'].includes(normalized)) return 'en';
  return 'en';
}

export function getGreetingText(locale, userName) {
  const texts = {
    en: `Hello ${userName}! 👋\nI am the CS C4I HD Assistant.\n\nHow can I help you today?`,
    he: `שלום ${userName}! 👋\nאני העוזר של CS C4I HD.\n\nאיך אפשר לעזור היום?`,
    ar: `مرحباً ${userName}! 👋\nأنا مساعد CS C4I HD.\n\nكيف يمكنني المساعدة اليوم؟`,
    ru: `Здравствуйте, ${userName}! 👋\nЯ помощник CS C4I HD.\n\nЧем могу помочь сегодня?`
  };
  return texts[locale] || texts.en;
}

export function isApprovedStatus(status) {
  return String(status || '').trim().toLowerCase() === 'approved';
}

export function isEmployeeUser(userData) {
  const registrationType = String(userData?.registration_type || '').trim().toLowerCase();
  if (registrationType === 'elbit_employee') return true;
  const role = String(userData?.role || '').trim().toLowerCase();
  return role.includes('employee') || role.includes('elbit') || role.includes('cs');
}
