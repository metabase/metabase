import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";

import Button from "metabase/core/components/Button";

import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { VisualizationProps } from "metabase-types/types/Visualization";

const ACTIONS_VIZ_DEFINITION = {
  uiName: t`Action button`,
  identifier: "action-button",
  iconName: "play",

  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,

  minSize: { width: 2, height: 1 },

  checkRenderable: () => true,
  isSensible: () => false,

  settings: {
    "card.title": {
      dashboard: false,
    },
    "card.description": {
      dashboard: false,
    },
    "button.label": {
      section: t`Display`,
      title: t`Label`,
      widget: "input",
      default: "Click Me",
    },
    "button.variant": {
      section: t`Display`,
      title: t`Variant`,
      widget: "select",
      default: "default",
      props: {
        options: [
          { name: t`Default`, value: "default" },
          { name: t`Primary`, value: "primary" },
          { name: t`Danger`, value: "danger" },
          { name: t`Success`, value: "success" },
          { name: t`Borderless`, value: "borderless" },
        ],
      },
    },
  },
};

interface ActionButtonVizProps extends VisualizationProps {
  dashboard: DashboardWithCards;
}

function ActionButtonViz({
  isSettings,
  settings,
  getExtraDataForClick,
  onVisualizationClick,
}: ActionButtonVizProps) {
  const label = settings["button.label"];
  const variant = settings["button.variant"];

  const variantProps: any = {};
  if (variant !== "default") {
    variantProps[variant] = true;
  }

  const clicked = useMemo(
    () => ({
      settings,
    }),
    [settings],
  );

  const extraData = useMemo(() => getExtraDataForClick?.(clicked), [
    clicked,
    getExtraDataForClick,
  ]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      onVisualizationClick({
        ...clicked,
        extraData,
        element: e.currentTarget as HTMLElement,
      });
    },
    [clicked, extraData, onVisualizationClick],
  );

  return (
    <Button
      className={cx({
        "full-height": !isSettings,
      })}
      onClick={onClick}
      {...variantProps}
    >
      {label}
    </Button>
  );
}

export default Object.assign(ActionButtonViz, ACTIONS_VIZ_DEFINITION);
