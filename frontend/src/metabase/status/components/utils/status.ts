import { isReducedMotionPreferred } from "metabase/utils/dom";
import type { IconName, LongTaskStatus } from "metabase-types/api";

export const getIconName = (status: LongTaskStatus): IconName => {
  switch (status) {
    case "incomplete":
      return "download";
    case "complete":
      return "check";
    case "aborted":
      return "warning";
  }
};

export const isSpinnerVisible = (status: LongTaskStatus): boolean => {
  switch (status) {
    case "incomplete":
      return !isReducedMotionPreferred();
    default:
      return false;
  }
};
