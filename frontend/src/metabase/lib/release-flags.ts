import type { ReleaseFlag } from "metabase-types/api";

export const setReleaseFlags = (flags: Record<ReleaseFlag, boolean>) => {
  window.MetabaseReleaseFlags = {
    ...(window.MetabaseReleaseFlags ?? {}),
    ...flags,
  };
};

export const hasReleaseFlag = (flag: ReleaseFlag): boolean => {
  return !!window?.MetabaseReleaseFlags?.[flag];
};

// hang this on the window so we can call it in clojureScript
window.hasReleaseFlag = hasReleaseFlag;
