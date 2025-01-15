import { useState } from "react";
import { withRouter } from "react-router";
import _ from "underscore";

// import * as Urls from "metabase/lib/urls";
import { ConfirmMoveDashboardQuestionCandidatesModal } from "./ConfirmMoveDashboardQuestionCandidatesModal";
import { MoveQuestionsIntoDashboardsInfoModal } from "./MoveQuestionsIntoDashboardsInfoModal";

interface MoveQuestionsIntoDashboardsModalProps {
  onClose: () => void;
  params: { slug: string };
}

export const MoveQuestionsIntoDashboardsModal = withRouter(
  ({ onClose: handleClose }: MoveQuestionsIntoDashboardsModalProps) => {
    const [acknowledgedInfoStep, setAcknowledgedInfoStep] = useState(false);

    // const collectionId = Urls.extractCollectionId(params.slug);
    const candidates = new Array(24).fill(null);

    const handleBulkMoveQuestionIntoDashboards = async () => {
      handleClose();
    };

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
        candidates={candidates}
        onConfirm={handleBulkMoveQuestionIntoDashboards}
        onCancel={handleClose}
      />
    );
  },
);
