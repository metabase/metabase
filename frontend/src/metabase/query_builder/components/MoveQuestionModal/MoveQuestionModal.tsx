import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useUpdateCardMutation } from "metabase/api";
import type { MoveDestination } from "metabase/collections/types";
import { canonicalCollectionId } from "metabase/collections/utils";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { MoveModal } from "metabase/containers/MoveModal";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import Dashboards from "metabase/entities/dashboards";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";
import { addUndo } from "metabase/redux/undo";
import { Box, Icon, Radio, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

interface MoveQuestionModalProps {
  question: Question;
  onClose: () => void;
}

type ConfirmationTypes = "dashboard-to-dashboard" | "dashboard-to-collection";

export const MoveQuestionModal = ({
  question,
  onClose,
}: MoveQuestionModalProps) => {
  const dispatch = useDispatch();

  const [confirmMoveState, setConfirmMoveState] = useState<{
    type: ConfirmationTypes;
    destination: MoveDestination;
  } | null>(null);
  const [deleteOldDashcards, setDeleteOldDashcards] = useState<
    boolean | undefined
  >();

  const [updateQuestion] = useUpdateCardMutation();

  const card = question.card();
  const canMoveToDashboard =
    card.type === "question" &&
    Boolean(
      card?.dashboard_count === 0 ||
        (card?.dashboard_count === 1 && card?.dashboard_id),
    );

  const handleMove = async (destination: MoveDestination) => {
    const update =
      destination.model === "dashboard"
        ? { dashboard_id: destination.id }
        : {
            dashboard_id: null,
            collection_id:
              canonicalCollectionId(destination.id) || ROOT_COLLECTION.id,
          };

    await updateQuestion({
      id: question.id(),
      delete_old_dashcards: deleteOldDashcards,
      ...update,
    })
      .then(() => {
        dispatch(
          addUndo({
            message: (
              <QuestionMoveToast
                destination={destination}
                question={question}
              />
            ),
            undo: false,
          }),
        );

        if (destination.model === "dashboard") {
          dispatch(
            push(
              Urls.dashboard(
                { id: destination.id, name: "TODO" },
                { editMode: true },
              ),
            ),
          );
        }
      })
      .finally(() => onClose());

    // TODO: handle error if update fails...
  };

  const handleChooseMoveLocation = (destination: MoveDestination) => {
    const wasDq = _.isNumber(question.dashboardId());
    const isDq = destination.model === "dashboard";

    if (wasDq && !isDq) {
      setConfirmMoveState({ type: "dashboard-to-collection", destination });
    } else if (wasDq && isDq) {
      setConfirmMoveState({ type: "dashboard-to-dashboard", destination });
    } else {
      handleMove(destination);
    }
  };

  if (confirmMoveState?.type === "dashboard-to-collection") {
    return (
      <Modal>
        <ConfirmContent
          data-testid="dashboard-to-collection-move-confirmation"
          onAction={() => handleMove(confirmMoveState?.destination)}
          onCancel={onClose}
          onClose={onClose}
          title={
            <Title fz="1.25rem" lh={1.5}>
              {t`Do you still want this question to appear in`}{" "}
              <Icon name="dashboard" style={{ marginBottom: -2 }} size={20} />{" "}
              <Dashboards.Name id={question.dashboardId()} />
            </Title>
          }
          message={
            <>
              <Box mt="-2rem">
                {t`It can still appear there even though you’re moving it into a collection.`}
              </Box>
              <Radio.Group
                value={`${!deleteOldDashcards}`}
                onChange={val => setDeleteOldDashcards(val !== "true")}
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
          confirmButtonPrimary
          confirmButtonText={t`Done`}
        />
      </Modal>
    );
  }

  if (confirmMoveState?.type === "dashboard-to-dashboard") {
    return (
      <Modal>
        <ConfirmContent
          data-testid="dashboard-to-dashboard-move-confirmation"
          onAction={() => handleMove(confirmMoveState.destination)}
          onCancel={onClose}
          onClose={onClose}
          title={
            <Title fz="1.25rem" lh={1.5}>
              Moving this question to another dashboard will remove it from{" "}
              <Icon name="dashboard" style={{ marginBottom: -2 }} size={20} />{" "}
              <Dashboards.Name id={question.dashboardId()} />
            </Title>
          }
          message={
            <Box mt="-2rem">
              {t`You can move it to a collection if you want to use it in both dashboards.`}
            </Box>
          }
          confirmButtonPrimary
          confirmButtonText={t`Okay`}
        />
      </Modal>
    );
  }

  return (
    <MoveModal
      title={t`Where do you want to save this?`}
      initialCollectionId={question.collectionId() ?? "root"}
      onClose={onClose}
      onMove={handleChooseMoveLocation}
      canMoveToDashboard={canMoveToDashboard}
    />
  );
};
