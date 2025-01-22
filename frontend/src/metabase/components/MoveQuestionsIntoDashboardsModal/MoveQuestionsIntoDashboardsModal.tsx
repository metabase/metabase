import type { Location } from "history";
import { useEffect, useState } from "react";
import { withRouter } from "react-router";
import { replace } from "react-router-redux";
import _ from "underscore";

import {
  skipToken,
  useListCollectionDashboardQuestionCandidatesQuery,
  useMoveCollectionDashboardQuestionCandidatesMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

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
    const dispatch = useDispatch();
    const [acknowledgedInfoStep, setAcknowledgedInfoStep] = useState(true);

    const candidatesReq = useListCollectionDashboardQuestionCandidatesQuery(
      collectionId ? collectionId : skipToken,
    );

    // TODO: handle error and loading state from the update result
    const [move] = useMoveCollectionDashboardQuestionCandidatesMutation();
    const handleBulkMoveQuestionIntoDashboards = async () => {
      if (!collectionId) {
        throw new Error("arg");
      }

      //
      move({
        collectionId,
        cardIds: candidatesReq.data?.data.map(card => card.id) ?? [],
      })
        .unwrap()
        .then(() => {
          handleClose();
        })
        .catch(err => {
          console.error(err);
        });
    };

    useEffect(() => {
      if (collectionId === undefined) {
        const redirectPath = pathname.replace("/cleanup-questions", "");
        dispatch(replace(redirectPath));
      }
    }, [dispatch, collectionId, pathname]);

    if (!acknowledgedInfoStep) {
      return (
        <MoveQuestionsIntoDashboardsInfoModal
          onConfirm={() => setAcknowledgedInfoStep(true)}
          onCancel={handleClose}
        />
      );
    }

    return (
      <ConfirmMoveDashboardQuestionCandidatesModal
        candidates={candidatesReq.data?.data}
        isLoading={candidatesReq.isLoading}
        error={candidatesReq.error}
        onConfirm={handleBulkMoveQuestionIntoDashboards}
        onCancel={handleClose}
      />
    );
  },
);
