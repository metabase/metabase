import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";

import { useToggle } from "metabase/hooks/use-toggle";

import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Question from "metabase-lib/lib/Question";
import { DashboardWithCards } from "metabase-types/types/Dashboard";
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
    "actions.linked_card": {
      section: t`Default actions`,
      title: t`Linked card`,
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

interface ActionsVizProps extends VisualizationProps {
  dashboard: DashboardWithCards;
  metadata?: Metadata;
}

function ActionsViz({ dashboard, metadata, settings }: ActionsVizProps) {
  const [isModalOpen, { turnOn: showModal, turnOff: hideModal }] = useToggle(
    false,
  );

  const connectedDashCardId = settings["actions.linked_card"];
  const connectedDashCard = dashboard.ordered_cards.find(
    dashCard => dashCard.id === connectedDashCardId,
  );

  const question = connectedDashCard
    ? new Question(connectedDashCard?.card, metadata)
    : null;

  const isObjectDetailView = question?.display() === "object";
  const table = question?.table();

  const hasCreateButton =
    settings["actions.create_enabled"] && !isObjectDetailView;
  const hasUpdateButton =
    settings["actions.update_enabled"] && isObjectDetailView;
  const hasDeleteButton =
    settings["actions.delete_enabled"] && isObjectDetailView;

  const horizontalAlignment = settings[
    "actions.align_horizontal"
  ] as HorizontalAlignmentValue;

  return (
    <>
      <Root horizontalAlignment={horizontalAlignment}>
        {hasCreateButton && (
          <Button disabled={!question} onClick={showModal}>{t`New`}</Button>
        )}
        {hasUpdateButton && <Button disabled={!question}>{t`Edit`}</Button>}
        {hasDeleteButton && (
          <Button disabled={!question} danger>{t`Delete`}</Button>
        )}
      </Root>
      {!!table && (
        <Modal isOpen={isModalOpen} onClose={hideModal}>
          <WritebackModalForm table={table} onClose={hideModal} />
        </Modal>
      )}
    </>
  );
}

export default Object.assign(ActionsViz, ACTIONS_VIZ_DEFINITION);
