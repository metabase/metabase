import dayjs from "dayjs";

export async function lazyLoadDayjsLocale(locale: string) {
  try {
    if (locale !== "en") {
      await import(`dayjs/locale/${locale}.js`);
    }
    dayjs.locale(locale);
  } catch {
    console.warn(`Could not set day.js locale to ${locale}`);
    dayjs.locale("en");
  }
}
