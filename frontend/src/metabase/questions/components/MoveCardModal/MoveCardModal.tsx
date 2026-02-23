import { useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";
import _ from "underscore";

import { getDashboard, useUpdateCardMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { QuestionMoveConfirmModal } from "metabase/collections/components/CollectionBulkActions/QuestionMoveConfirmModal";
import type { MoveDestination } from "metabase/collections/types";
import {
  canonicalCollectionId,
  getEntityTypeFromCardType,
} from "metabase/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import type { OmniPickerCollectionItem } from "metabase/common/components/Pickers";
import { MoveModal } from "metabase/common/components/Pickers";
import { Dashboards } from "metabase/entities/dashboards";
import { INJECT_RTK_QUERY_QUESTION_VALUE } from "metabase/entities/questions";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { API_UPDATE_QUESTION } from "metabase/query_builder/actions";
import { addUndo } from "metabase/redux/undo";
import { Box, Icon, Radio, Title } from "metabase/ui";
import type { Card } from "metabase-types/api";

import MoveCardToast from "./MoveCardToast";

interface MoveCardModalProps {
  card: Card;
  onClose: () => void;
}

type ConfirmationTypes =
  | "dashboard-to-dashboard"
  | "dashboard-to-collection"
  | "collection-to-dashboard";

export const MoveCardModal = ({ card, onClose }: MoveCardModalProps) => {
  const dispatch = useDispatch();

  const [updateCard] = useUpdateCardMutation();

  const [confirmMoveState, setConfirmMoveState] = useState<{
    type: ConfirmationTypes;
    destination: MoveDestination;
    affectedDashboards?: any[];
    isLoading?: boolean;
  } | null>(null);
  const [deleteOldDashcardsState, setDeleteOldDashcardsState] = useState<
    boolean | undefined
  >();

  const [errorMessage, setErrorMessage] = useState<string>();

  const handleMove = (
    destination: MoveDestination,
    deleteOldDashcards?: boolean | undefined,
  ) => {
    const update =
      destination.model === "dashboard"
        ? { dashboard_id: destination.id as number }
        : {
            dashboard_id: null,
            collection_id: canonicalCollectionId(destination.id),
          };

    return updateCard({
      id: card.id,
      delete_old_dashcards: deleteOldDashcards,
      ...update,
    })
      .unwrap()
      .then(async (updatedCard) => {
        // HACK: entity framework would previously keep the qb in sync
        // with changing where the question lived
        dispatch({ type: API_UPDATE_QUESTION, payload: updatedCard });
        dispatch({
          type: INJECT_RTK_QUERY_QUESTION_VALUE,
          payload: updatedCard,
        });

        dispatch(
          addUndo({
            message: <MoveCardToast card={card} destination={destination} />,
            undo: false,
          }),
        );

        if (destination.model === "dashboard") {
          const dashboard = await dispatch(
            getDashboard.initiate({ id: destination.id }),
          )
            .unwrap()
            .catch(() => undefined); // we can fallback to navigation w/o this info
          const dashcard = dashboard?.dashcards.find(
            (c) => c.card_id === card.id,
          );

          if (!dashboard || !dashcard) {
            console.warn(
              "Could not fetch dashcard position on dashboard, falling back to navigation without auto-scrolling",
            );
          }

          const url = Urls.dashboard(
            { id: destination.id, name: "", ...dashboard },
            { editMode: true, scrollToDashcard: dashcard?.id },
          );
          dispatch(push(url));
        }

        onClose();
      })
      .catch((e) => {
        setErrorMessage(getErrorMessage(e));
        if (destination.model !== "dashboard") {
          // we want this error to bubble up to the modal if we're not
          // showing the dashboard confirm modal
          throw new Error(getErrorMessage(e));
        }
      });
  };

  const handleMoveConfirm = async () => {
    if (confirmMoveState?.destination) {
      await handleMove(confirmMoveState?.destination, true);
    }
  };

  const handleChooseMoveLocation = async (destination: MoveDestination) => {
    const wasDq = _.isNumber(card.dashboard_id);
    const isDq = destination.model === "dashboard";
    const dashCount = card.dashboard_count ?? 0;

    if (wasDq && !isDq) {
      setConfirmMoveState({ type: "dashboard-to-collection", destination });
    } else if (wasDq && isDq) {
      setConfirmMoveState({ type: "dashboard-to-dashboard", destination });
    } else if (!wasDq && isDq && dashCount > 0) {
      //Find out if any other dashboards will be affected
      setConfirmMoveState({
        type: "collection-to-dashboard",
        destination,
      });
    } else {
      await handleMove(destination);
    }
  };

  if (confirmMoveState?.type === "dashboard-to-collection") {
    return (
      <ConfirmModal
        data-testid="dashboard-to-collection-move-confirmation"
        opened
        onConfirm={() => {
          handleMove(confirmMoveState?.destination, deleteOldDashcardsState);
          onClose();
        }}
        onClose={onClose}
        title={
          <Title order={3}>
            {c(
              "{0} is the dashboard name the question currently has dashcards in",
            ).jt`Do you still want this question to appear in ${(
              <>
                <Icon
                  key="icon"
                  name="dashboard"
                  style={{ marginBottom: -2 }}
                  size={20}
                />{" "}
                <Dashboards.Name key="name" id={card.dashboard_id} />
              </>
            )}?`}
          </Title>
        }
        message={
          <>
            <Box mt="-1.5rem">
              {t`It can still appear there even though you’re moving it into a collection.`}
            </Box>
            <Radio.Group
              value={`${!deleteOldDashcardsState}`}
              onChange={(val) => setDeleteOldDashcardsState(val !== "true")}
              mt="2rem"
            >
              <Radio
                label={t`Yes, it should still appear there`}
                value={"true"}
              />
              <Radio
                mt="md"
                label={t`No, remove it from that dashboard`}
                value={"false"}
              />
            </Radio.Group>
          </>
        }
        confirmButtonProps={{ color: "brand", variant: "filled" }}
        confirmButtonText={t`Done`}
      />
    );
  }

  if (confirmMoveState?.type === "dashboard-to-dashboard") {
    return (
      <ConfirmModal
        opened
        data-testid="dashboard-to-dashboard-move-confirmation"
        onConfirm={() => handleMove(confirmMoveState.destination, true)}
        onClose={onClose}
        title={
          <Title fz="1.25rem" lh={1.5}>
            {c("{0} is the name of a dashboard")
              .jt`Moving this question to another dashboard will remove it from ${(
              <>
                <Icon
                  key="icon"
                  name="dashboard"
                  style={{ marginBottom: -2 }}
                  size={20}
                />{" "}
                <Dashboards.Name key="name" id={card.dashboard_id} />
              </>
            )}`}
          </Title>
        }
        message={t`You can move it to a collection if you want to use it in both dashboards.`}
        confirmButtonText={t`Okay`}
        confirmButtonProps={{ color: "brand", variant: "filled" }}
      />
    );
  }

  if (confirmMoveState?.type === "collection-to-dashboard") {
    return (
      <QuestionMoveConfirmModal
        selectedItems={[
          {
            name: card.name,
            id: card.id,
            model: "card",
          },
        ]}
        onConfirm={handleMoveConfirm}
        onClose={onClose}
        destination={confirmMoveState?.destination}
        errorMessage={errorMessage}
      />
    );
  }

  const shouldDisable = (item: OmniPickerCollectionItem) => {
    const dashboardId = card.dashboard_id;

    if (dashboardId) {
      // it's already in the dashboard
      return item.model === "dashboard" && item.id === dashboardId;
    }

    return false;
  };

  return (
    <MoveModal
      title={t`Where do you want to save this?`}
      onClose={onClose}
      onMove={handleChooseMoveLocation}
      canMoveToDashboard={card.type === "question"}
      movingItem={{
        ...card,
        collection: {
          // parent collection info
          id: card.collection_id ?? "root",
          name: "",
          namespace: card.collection?.namespace,
        },
        model: getEntityTypeFromCardType(card.type),
        dashboard_id: card.dashboard_id ?? undefined,
      }}
      isDisabledItem={shouldDisable}
    />
  );
};
