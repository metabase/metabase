import { match } from "ts-pattern";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useSetArchive } from "metabase/archive/hooks";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { useMetadataToasts, useSetCollection } from "metabase/common/hooks";
import { LibraryMoveModal } from "metabase/data-studio/common/components/LibraryTreePage/LibraryBulkActions";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Dashboard, RegularCollectionId } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/dashboard";

import { getDashcardCards } from "../../../utils";

export type DashboardModalType = "move" | "duplicate" | "trash";

const NO_MOVING_COLLECTIONS: string[] = [];

type DashboardModalProps = {
  dashboard: Dashboard;
  modalType: DashboardModalType;
  onClose: () => void;
};

export function DashboardModal({
  dashboard,
  modalType,
  onClose,
}: DashboardModalProps) {
  return match(modalType)
    .with("move", () => <MoveModal dashboard={dashboard} onClose={onClose} />)
    .with("duplicate", () => (
      <DuplicateModal dashboard={dashboard} onClose={onClose} />
    ))
    .with("trash", () => <TrashModal dashboard={dashboard} onClose={onClose} />)
    .exhaustive();
}

type DashboardModalContentProps = {
  dashboard: Dashboard;
  onClose: () => void;
};

function MoveModal({ dashboard, onClose }: DashboardModalContentProps) {
  const setCollection = useSetCollection();
  const { sendErrorToast } = useMetadataToasts();

  const handleMove = async (destinationId: RegularCollectionId | null) => {
    try {
      await setCollection(
        { model: "dashboard", id: dashboard.id },
        { id: destinationId ?? "root" },
      );
    } catch (error) {
      sendErrorToast(getErrorMessage(error, t`Failed to move`));
    } finally {
      onClose();
    }
  };

  return (
    <LibraryMoveModal
      section="dashboards"
      initialCollectionId={dashboard.collection_id}
      movingCollectionIds={NO_MOVING_COLLECTIONS}
      onMove={handleMove}
      onClose={onClose}
    />
  );
}

function DuplicateModal({ dashboard, onClose }: DashboardModalContentProps) {
  const navigate = useNavigate();

  const handleSaved = (copy: { id: number }) => {
    onClose();
    navigate(Urls.dataStudioDashboard(copy.id));
  };

  return (
    <CollectionCopyEntityModal
      entityObject={{ ...dashboard, model: "dashboard" }}
      onClose={onClose}
      onSaved={handleSaved}
    />
  );
}

// The dashboard app's trash modal reads its runtime state, which a Data Studio page does not load
function TrashModal({ dashboard, onClose }: DashboardModalContentProps) {
  const archive = useSetArchive();
  const hasDashboardQuestions = getDashcardCards(dashboard).some(
    (card) => isReadableCard(card) && card.dashboard_id === dashboard.id,
  );
  const message = hasDashboardQuestions
    ? t`This will trash the dashboard and the questions that are saved in it. Are you sure you want to do this?`
    : t`Are you sure you want to do this?`;

  return (
    <ArchiveModal
      title={t`Move this dashboard to trash?`}
      model="dashboard"
      modelId={Number(dashboard.id)}
      message={message}
      onArchive={() => archive({ model: "dashboard", id: dashboard.id }, true)}
      onClose={onClose}
    />
  );
}
