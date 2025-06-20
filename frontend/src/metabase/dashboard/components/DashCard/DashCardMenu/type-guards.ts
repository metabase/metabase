import React, { type ReactNode } from "react";

import type { DashboardContextProps } from "metabase/dashboard/context";
import type {
  DashboardCardMenuCustomElement,
  DashboardCardMenuObject,
} from "metabase/dashboard/context/types/dashcard-menu";

export const isReactNode = (
  menu: DashboardContextProps["dashcardMenu"],
): menu is Exclude<
  ReactNode,
  DashboardCardMenuCustomElement | DashboardCardMenuObject
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
): menu is DashboardCardMenuObject => {
  return typeof menu === "object" && menu !== null;
};
