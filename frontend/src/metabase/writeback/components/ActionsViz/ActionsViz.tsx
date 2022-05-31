import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";

import { useToggle } from "metabase/hooks/use-toggle";

import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";

import Metadata from "metabase-lib/lib/metadata/Metadata";
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
    "actions.linked_table": {
      section: t`Default actions`,
      title: t`Linked table`,
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
  metadata?: Metadata;
}

function ActionsViz({ metadata, settings }: ActionsVizProps) {
  const [isModalOpen, { turnOn: showModal, turnOff: hideModal }] = useToggle(
    false,
  );

  const connectedTableId = settings["actions.linked_table"];
  const connectedTable = metadata?.table(connectedTableId);
  const hasConnectedTable = !!connectedTable;

  const hasCreateButton = settings["actions.create_enabled"];
  const hasUpdateButton = settings["actions.update_enabled"];
  const hasDeleteButton = settings["actions.delete_enabled"];

  const horizontalAlignment = settings[
    "actions.align_horizontal"
  ] as HorizontalAlignmentValue;

  return (
    <>
      <Root horizontalAlignment={horizontalAlignment}>
        {hasCreateButton && (
          <Button
            disabled={!hasConnectedTable}
            onClick={showModal}
          >{t`New`}</Button>
        )}
        {hasUpdateButton && (
          <Button disabled={!hasConnectedTable}>{t`Edit`}</Button>
        )}
        {hasDeleteButton && (
          <Button disabled={!hasConnectedTable} danger>{t`Delete`}</Button>
        )}
      </Root>
      {connectedTable && (
        <Modal isOpen={isModalOpen} onClose={hideModal}>
          <WritebackModalForm table={connectedTable} onClose={hideModal} />
        </Modal>
      )}
    </>
  );
}

export default Object.assign(ActionsViz, ACTIONS_VIZ_DEFINITION);
