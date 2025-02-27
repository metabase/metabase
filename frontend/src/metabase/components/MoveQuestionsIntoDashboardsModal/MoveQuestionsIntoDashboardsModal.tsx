import { QueryStatus } from "@reduxjs/toolkit/query";
import type { Location } from "history";
import { useEffect } from "react";
import { withRouter } from "react-router";
import { replace } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useListCollectionDashboardQuestionCandidatesQuery,
  useMoveCollectionDashboardQuestionCandidatesMutation,
} from "metabase/api";
import { useUserAcknowledgement } from "metabase/hooks/use-user-acknowledgement";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";

import { ConfirmMoveDashboardQuestionCandidatesModal } from "./ConfirmMoveDashboardQuestionCandidatesModal";
import { MoveQuestionsIntoDashboardsInfoModal } from "./MoveQuestionsIntoDashboardsInfoModal";

interface MoveQuestionsIntoDashboardsModalProps {
  onClose: () => void;
  params: { slug: string };
  location: Location<unknown>;
}

export const MoveQuestionsIntoDashboardsModal = withRouter(
  ({
    location: { pathname },
    params,
    onClose: handleClose,
  }: MoveQuestionsIntoDashboardsModalProps) => {
    const collectionId = Urls.extractCollectionId(params.slug);
    const isAdmin = useSelector(getUserIsAdmin);

    const [ackedInfoStep, { ack: ackInfoStep, isLoading: isAckedInfoLoading }] =
      useUserAcknowledgement("dashboard_question_migration_info_modal");

    const dispatch = useDispatch();
    const candidatesReq = useListCollectionDashboardQuestionCandidatesQuery(
      collectionId && isAdmin ? { collectionId } : skipToken,
    );
    const [bulkMove, bulkMoveReq] =
      useMoveCollectionDashboardQuestionCandidatesMutation();

    // redirect to base collection page if there's an invalid collection id
    useEffect(() => {
      if (collectionId === undefined || !isAdmin) {
        const redirectPath = pathname.replace("/move-questions-dashboard", "");
        dispatch(replace(redirectPath));
      }
    }, [dispatch, collectionId, pathname, isAdmin]);

    const handleBulkMoveQuestionIntoDashboards = async () => {
      if (collectionId) {
        const cardIds = candidatesReq.data?.data.map(card => card.id) ?? [];
        try {
          await bulkMove({ collectionId, cardIds }).unwrap();
          dispatch(
            addUndo({
              message: t`The questions were successfully moved into their dashboards`,
            }),
          );
          handleClose();
        } catch (err) {
          console.error(err);
        }
      }
    };

    // reset error state after 5 seconds
    useEffect(() => {
      if (bulkMoveReq.status === QueryStatus.rejected) {
        const timeout = setTimeout(() => bulkMoveReq.reset(), 5000);
        return () => clearTimeout(timeout);
      }
    }, [bulkMoveReq]);

    if (isAckedInfoLoading) {
      return null;
    }

    if (!ackedInfoStep) {
      return (
        <MoveQuestionsIntoDashboardsInfoModal
          onConfirm={ackInfoStep}
          onCancel={handleClose}
        />
      );
    }

    return (
      <ConfirmMoveDashboardQuestionCandidatesModal
        candidates={candidatesReq.data?.data}
        isLoading={candidatesReq.isLoading}
        fetchError={candidatesReq.error}
        isMutating={bulkMoveReq.isLoading}
        mutationError={bulkMoveReq.error}
        onConfirm={handleBulkMoveQuestionIntoDashboards}
        onCancel={handleClose}
      />
    );
  },
);
