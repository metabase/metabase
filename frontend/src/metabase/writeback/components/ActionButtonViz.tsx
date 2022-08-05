import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";

import { useConfirmation } from "metabase/hooks/use-confirmation";

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
    "confirmation_modal.is_required": {
      section: t`Confirmation`,
      title: t`Require confirmation`,
      widget: "toggle",
      default: false,
    },
    "confirmation_modal.title": {
      section: t`Confirmation`,
      title: t`Confirmation modal title`,
      widget: "input",
      default: t`Are you sure?`,
      getHidden: (_: any, settings: any) =>
        !settings["confirmation_modal.is_required"],
    },
    "confirmation_modal.description": {
      section: t`Confirmation`,
      title: t`Confirmation modal description`,
      widget: "input",
      default: t`This cannot be undone`,
      getHidden: (_: any, settings: any) =>
        !settings["confirmation_modal.is_required"],
    },
    "confirmation_modal.submit.title": {
      section: t`Confirmation`,
      title: t`Submit button title`,
      widget: "input",
      default: t`Confirm`,
      getHidden: (_: any, settings: any) =>
        !settings["confirmation_modal.is_required"],
    },
    "confirmation_modal.cancel.title": {
      section: t`Confirmation`,
      title: t`Cancel button title`,
      widget: "input",
      default: t`Cancel`,
      getHidden: (_: any, settings: any) =>
        !settings["confirmation_modal.is_required"],
    },
    "user_input_modal.description": {
      section: t`User input modal`,
      title: t`Description`,
      widget: "text",
    },
  },
};

interface ActionButtonVizProps extends VisualizationProps {
  dashboard: DashboardWithCards;
}

function ActionButtonViz({
  settings,
  getExtraDataForClick,
  onVisualizationClick,
}: ActionButtonVizProps) {
  const { modalContent: confirmationModal, show: requestConfirmation } =
    useConfirmation();

  const label = settings["button.label"];
  const variant = settings["button.variant"];

  const confirmationModalSettings = useMemo(() => {
    const result: Record<string, any> = {};

    Object.keys(settings).forEach(key => {
      if (key.startsWith("confirmation_modal.")) {
        const shortKey = key.replace("confirmation_modal.", "");
        result[shortKey] = settings[key];
      }
    });

    return result;
  }, [settings]);

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

  const extraData = useMemo(
    () => getExtraDataForClick?.(clicked),
    [clicked, getExtraDataForClick],
  );

  const handleTriggerAction = useCallback(
    (e: React.MouseEvent) => {
      return onVisualizationClick({
        ...clicked,
        extraData,
        element: e.currentTarget as HTMLElement,
      });
    },
    [clicked, extraData, onVisualizationClick],
  );

  const handleActionRequiringConfirmation = useCallback(
    (e: React.MouseEvent) => {
      requestConfirmation({
        title: confirmationModalSettings.title,
        message: confirmationModalSettings.description,
        confirmButtonText: confirmationModalSettings["submit.title"],
        cancelButtonText: confirmationModalSettings["cancel.title"],
        onConfirm: async () => handleTriggerAction(e),
      });
    },
    [confirmationModalSettings, requestConfirmation, handleTriggerAction],
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (confirmationModalSettings.is_required) {
        handleActionRequiringConfirmation(e);
      } else {
        handleTriggerAction(e);
      }
    },
    [
      confirmationModalSettings,
      handleTriggerAction,
      handleActionRequiringConfirmation,
    ],
  );

  return (
    <>
      <div className="flex full-height full-width layout-centered px1">
        <Button onClick={onClick} {...variantProps} fullWidth>
          {label}
        </Button>
      </div>
      {confirmationModal}
    </>
  );
}

export default Object.assign(ActionButtonViz, ACTIONS_VIZ_DEFINITION);
