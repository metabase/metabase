import { lazyLoadDayjsLocale } from "./lazy-load-dayjs-locale";
import { lazyLoadMomentLocale } from "./lazy-load-moment-locale";

export async function lazyLoadDateLocales(locale: string) {
  await Promise.all([
    lazyLoadMomentLocale(locale),
    lazyLoadDayjsLocale(locale),
  ]);
}
