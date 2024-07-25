import { t } from "ttag";

import type { Status, StatusConfig } from "./types";

export const getStatusConfig = (status: Status): StatusConfig => {
  if (status === "clear") {
    return {
      icon: "close",
      label: t`Clear filter`,
    };
  }

  if (status === "reset") {
    return {
      icon: "refresh",
      label: t`Reset filter to default state`,
    };
  }

  if (status === "empty") {
    return {
      disabled: true,
      icon: "chevrondown",
      label: null,
    };
  }

  if (status === "none") {
    return {
      disabled: true,
      icon: "empty",
      label: null,
    };
  }

  throw new Error(`Unknown status: "${status}"`);
};
