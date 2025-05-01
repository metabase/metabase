// eslint-disable-next-line no-restricted-imports
import moment from "moment-timezone";

declare const __vite__mapDeps: Record<string, unknown>;

export async function lazyLoadMomentLocale(locale: string) {
  if (locale === "en") {
    moment.locale("en");
    return;
  }

  const getCjsLocale = async () => {
    try {
      await import(`moment/locale/${locale}.js`);
    } catch {}
  };
  const getEsmLocale = async () => {
    try {
      await import(`moment/dist/locale/${locale}.js`);
    } catch {}
  };

  const isVite = () => {
    // The `__vite__mapDeps` helper is added for dynamic imports by Vite:
    // https://github.com/vitejs/vite/blob/3bfe5c5ff96af0a0624c8f14503ef87a0c0850ed/packages/vite/src/node/plugins/importAnalysisBuild.ts#L660
    // We add dynamic imports for locales, so Vite should have this helper defined in a global scope.
    return typeof __vite__mapDeps !== "undefined";
  };

  // Vite resolves the `ESM` moment based on the deprecated `jsnext:main` field,
  // so we have try to load `ESM` locale first
  // The `jsnext:main` mostly is not supported by other frameworks/bundlers
  const localeGetters = isVite()
    ? [getEsmLocale, getCjsLocale]
    : [getCjsLocale, getEsmLocale];

  try {
    let isLocaleUpdated = false;
    for (const localeGetter of localeGetters) {
      await localeGetter();

      moment.locale(locale);
      isLocaleUpdated = moment.locale() === locale;

      if (isLocaleUpdated) {
        break;
      }
    }

    if (!isLocaleUpdated) {
      throw new Error(`Could not detect moment locale format`);
    }
  } catch (err) {
    console.warn(`Could not set moment.js locale to ${locale}`, err);
    moment.locale("en");
  }
}
