import { isValidElement } from "react";
import { P, match } from "ts-pattern";

import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import type {
  MetabaseDashboardPluginsConfig,
  DashboardCardCustomMenuItem as SdkDashboardCardCustomMenuItem,
  DashboardCardMenuCustomElement as SdkDashboardCardMenuCustomElement,
} from "embedding-sdk/types/plugins";
import type { DashboardCardMenuProps } from "metabase/dashboard/context/types/dashcard-menu";
import { isNotNull } from "metabase/lib/types";

export const isSdkCustomElementFn = (
  menu: MetabaseDashboardPluginsConfig["dashboardCardMenu"],
): menu is SdkDashboardCardMenuCustomElement => {
  return typeof menu === "function";
};

export const isSdkCustomMenuConfig = (
  menu: MetabaseDashboardPluginsConfig["dashboardCardMenu"],
): menu is SdkDashboardCardCustomMenuItem => {
  return (
    typeof menu === "object" &&
    menu !== null &&
    !isValidElement(menu) &&
    ("withDownloads" in menu || "withEditLink" in menu || "customItems" in menu)
  );
};

export function resolveSdkDashcardMenu(
  dashcardMenu: MetabaseDashboardPluginsConfig["dashboardCardMenu"],
) {
  return match(dashcardMenu)
    .with(P.nullish, () => null)

    .with(
      P.when(isSdkCustomElementFn),
      (fn: SdkDashboardCardMenuCustomElement) => {
        return (props: DashboardCardMenuProps) => {
          return fn({
            question: transformSdkQuestion(props.question),
          });
        };
      },
    )

    .with(
      P.when(isSdkCustomMenuConfig),
      (menu: SdkDashboardCardCustomMenuItem) => ({
        download: menu.withDownloads,
        "edit-link": menu.withEditLink,
        "edit-visualization": menu.withEditLink,
        customItems: menu.customItems
          ?.map((item) =>
            typeof item === "function"
              ? (props: DashboardCardMenuProps) =>
                  item({
                    question: transformSdkQuestion(props.question),
                  })
              : item,
          )
          .filter(isNotNull),
      }),
    )

    .exhaustive();
}
