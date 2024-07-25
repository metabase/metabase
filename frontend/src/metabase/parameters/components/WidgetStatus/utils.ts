import { t } from "ttag";

import type { Status, StatusConfig } from "./types";

export const getStatusConfig = (status: Status): StatusConfig => {
  if (status === "clear") {
    return {
      button: true,
      icon: "close",
      label: t`Clear`,
    };
  }

  if (status === "reset") {
    return {
      button: true,
      icon: "refresh",
      label: t`Reset filter to default state`,
    };
  }

  if (status === "empty") {
    return {
      icon: "chevrondown",
    };
  }

  if (status === "none") {
    return {
      icon: "empty",
    };
  }

  throw new Error(`Unknown status: "${status}"`);
};
