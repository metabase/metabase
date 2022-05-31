import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import { VisualizationProps } from "metabase-types/types/Visualization";

import { HorizontalAlignmentValue } from "./types";
import { Root } from "./ActionsViz.styled";

const ACTIONS_VIZ_DEFINITION = {
  uiName: t`Actions`,
  identifier: "actions",
  iconName: "bolt",

  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,

  minSize: { width: 4, height: 1 },

  checkRenderable: () => true,
  isSensible: () => false,

  settings: {
    "card.title": {
      dashboard: false,
    },
    "card.description": {
      dashboard: false,
    },
    "actions.create_enabled": {
      section: t`Default actions`,
      title: t`Create enabled`,
      widget: "toggle",
      default: true,
    },
    "actions.update_enabled": {
      section: t`Default actions`,
      title: t`Update enabled`,
      widget: "toggle",
      default: true,
    },
    "actions.delete_enabled": {
      section: t`Default actions`,
      title: t`Delete enabled`,
      widget: "toggle",
      default: true,
    },
    "actions.align_horizontal": {
      section: t`Display`,
      title: t`Horizontal Alignment`,
      widget: "select",
      props: {
        options: [
          { name: t`Left`, value: "left" },
          { name: t`Center`, value: "center" },
          { name: t`Right`, value: "right" },
        ],
      },
      default: "right",
    },
  },
};

function ActionsViz({ settings }: VisualizationProps) {
  const hasCreateButton = settings["actions.create_enabled"];
  const hasUpdateButton = settings["actions.update_enabled"];
  const hasDeleteButton = settings["actions.delete_enabled"];

  const horizontalAlignment = settings[
    "actions.align_horizontal"
  ] as HorizontalAlignmentValue;

  return (
    <Root horizontalAlignment={horizontalAlignment}>
      {hasCreateButton && <Button>{t`New`}</Button>}
      {hasUpdateButton && <Button>{t`Edit`}</Button>}
      {hasDeleteButton && <Button danger>{t`Delete`}</Button>}
    </Root>
  );
}

export default Object.assign(ActionsViz, ACTIONS_VIZ_DEFINITION);
