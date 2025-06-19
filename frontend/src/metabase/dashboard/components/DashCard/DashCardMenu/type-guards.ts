import React, { type ReactNode } from "react";

import type {
  type DashboardCardCustomMenuItem,
  type DashboardCardMenuCustomElement,
  DashboardContextProps,
} from "metabase/dashboard/context";

import { undefined } from "./DashCardMenu";

export const isReactNode = (
  menu: DashboardContextProps["dashcardMenu"],
): menu is Exclude<
  ReactNode,
  DashboardCardMenuCustomElement | DashboardCardCustomMenuItem
> => {
  const isFunction = typeof menu === "function";
  const isObjectButNotValidElement =
    typeof menu === "object" && menu !== null && !React.isValidElement(menu);

  return !isFunction && !isObjectButNotValidElement && menu !== undefined;
};
export const isCustomElementFn = (
  menu: DashboardContextProps["dashcardMenu"],
): menu is DashboardCardMenuCustomElement => {
  return typeof menu === "function";
};
export const isCustomMenuConfig = (
  menu: DashboardContextProps["dashcardMenu"],
): menu is DashboardCardCustomMenuItem => {
  return typeof menu === "object" && menu !== null;
};
