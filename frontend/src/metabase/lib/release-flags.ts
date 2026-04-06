export type ReleaseFlag = "joke-of-the-day";

export type ReleaseFlagMap = Record<ReleaseFlag, boolean>;

const MetabaseReleaseFlags: ReleaseFlagMap =
  (process.env.RELEASE_FLAGS as unknown as ReleaseFlagMap) ?? {};

export const hasReleaseFlag = (flag: ReleaseFlag): boolean => {
  return MetabaseReleaseFlags?.[flag];
};

// hang this on the window so we can call it in clojureScript
window.hasReleaseFlag = hasReleaseFlag;
