import React from "react";

import { useToggle } from "metabase/hooks/use-toggle";

import type {
  ImplicitActionType,
  ImplicitActionClickBehavior,
} from "metabase-types/api";
import type { VisualizationProps } from "metabase-types/types/Visualization";

import ImplicitInsertModal from "./ImplicitInsertModal";
import ImplicitUpdateModal from "./ImplicitUpdateModal";
import ImplicitDeleteModal from "./ImplicitDeleteModal";

import ActionButtonView from "./ActionButtonView";

type ImplicitActionButtonProps = {
  isSettings: VisualizationProps["isSettings"];
  settings: VisualizationProps["settings"];
};

function FallbackActionComponent({ children }: { children: React.ReactNode }) {
  return children;
}

const ACTION_COMPONENT_MAP: Record<
  ImplicitActionType,
  React.ComponentType<any>
> = {
  insert: ImplicitInsertModal,
  update: ImplicitUpdateModal,
  delete: ImplicitDeleteModal,
};

function ImplicitActionButton({
  isSettings,
  settings,
}: ImplicitActionButtonProps) {
  const [isOpen, { turnOn: handleShowModal, turnOff: handleHideModal }] =
    useToggle();

  const { type, actionType, ...actionProps } =
    settings.click_behavior as ImplicitActionClickBehavior;

  const ActionComponent =
    ACTION_COMPONENT_MAP[actionType] || FallbackActionComponent;

  return (
    <ActionComponent isOpen={isOpen} onClose={handleHideModal} {...actionProps}>
      <ActionButtonView
        onClick={handleShowModal}
        settings={settings}
        isFullHeight={!isSettings}
      />
    </ActionComponent>
  );
}

export default ImplicitActionButton;
