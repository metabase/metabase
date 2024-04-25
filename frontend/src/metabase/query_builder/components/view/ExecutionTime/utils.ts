import { t } from "ttag";

export const formatDuration = (time: number): string => {
  if (time < 1000) {
    return t`${time} ms`;
  }

  return t`${(time / 1000).toFixed(1)} s`;
};
