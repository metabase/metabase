import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";

import { useToggle } from "metabase/hooks/use-toggle";

import { getCardData } from "metabase/dashboard/selectors";
import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Question from "metabase-lib/lib/Question";

import { State } from "metabase-types/store";
import { SavedCard } from "metabase-types/types/Card";
import { DashboardWithCards, DashCard } from "metabase-types/types/Dashboard";
import { Dataset } from "metabase-types/types/Dataset";
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

// { [dashCardId]: { [cardId]: <dataset> } }
type DashCardData = Record<number, Record<number, Dataset | undefined>>;

interface ActionVizOwnProps extends VisualizationProps {
  dashboard: DashboardWithCards;
  dashCardData?: DashCardData;
  metadata?: Metadata;
}

interface ActionWizStateProps {
  dashCardData?: DashCardData;
}

type ActionsVizProps = ActionVizOwnProps & ActionWizStateProps;

function mapStateToProps(state: State) {
  return {
    dashCardData: getCardData(state),
  };
}

function getObjectDetailViewData(
  dashCardData: DashCardData,
  dashCard: DashCard<SavedCard>,
): unknown[] | undefined {
  const cardQueryResult = dashCardData[dashCard.id][dashCard.card_id];
  return cardQueryResult?.data.rows[0];
}

function ActionsViz({
  dashboard,
  dashCardData,
  metadata,
  settings,
}: ActionsVizProps) {
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
  const row =
    connectedDashCard && isObjectDetailView && dashCardData
      ? getObjectDetailViewData(
          dashCardData,
          connectedDashCard as DashCard<SavedCard>,
        )
      : undefined;

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
        {hasUpdateButton && (
          <Button disabled={!question} onClick={showModal}>{t`Edit`}</Button>
        )}
        {hasDeleteButton && (
          <Button disabled={!question} danger>{t`Delete`}</Button>
        )}
      </Root>
      {!!table && (
        <Modal isOpen={isModalOpen} onClose={hideModal}>
          <WritebackModalForm table={table} row={row} onClose={hideModal} />
        </Modal>
      )}
    </>
  );
}

const ConnectedActionsViz = connect<
  ActionWizStateProps,
  unknown,
  ActionVizOwnProps,
  State
>(mapStateToProps)(ActionsViz);

export default Object.assign(ConnectedActionsViz, ACTIONS_VIZ_DEFINITION);
