export type ReleaseFlag = "joke-of-the-day";

export type ReleaseFlagInfo = {
  value: boolean;
  description: string;
};

export type ReleaseFlagMap = Record<ReleaseFlag, ReleaseFlagInfo>;
