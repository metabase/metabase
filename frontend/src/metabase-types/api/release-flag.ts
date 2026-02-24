export type ReleaseFlag = "joke-of-the-day";

export type ReleaseFlagInfo = {
  is_enabled: boolean;
  description: string;
};

export type ReleaseFlagMap = Record<ReleaseFlag, ReleaseFlagInfo>;
