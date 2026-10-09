import { useLocale as setTranslationLocale } from "ttag";

import { dayjs } from "metabase/dayjs";

// The node:test harness keeps packages loaded for the life of a worker, where
// jest loads them again for every spec file. This puts back, between files,
// the state that our code keeps inside those packages.
export function prepareBetweenFiles() {
  // dayjs is one instance per worker, and the order its plugins are installed
  // in changes what format() returns. Loading the app's own entry first gives
  // every file the order the app has, whichever spec ran before it.
  const baselineLocale = dayjs.locale();
  const baselineTable = new Map(
    Object.entries(dayjs.Ls).map(([name, definition]) => [
      name,
      { ...definition },
    ]),
  );

  return function betweenFiles() {
    // A spec that switches the language or edits a locale would otherwise
    // change date text for every later file.
    for (const [name, definition] of baselineTable) {
      const live = dayjs.Ls[name];
      if (!live) {
        dayjs.Ls[name] = { ...definition };
        continue;
      }
      for (const key of Object.keys(live)) {
        if (!(key in definition)) {
          delete live[key];
        }
      }
      Object.assign(live, definition);
    }
    if (dayjs.locale() !== baselineLocale) {
      dayjs.locale(baselineLocale);
    }
    // The translation library is shared the same way, so the locale a spec
    // selects would stay for every later file.
    setTranslationLocale("en");
  };
}
