import { match } from "ts-pattern";

import { useSetArchive } from "metabase/archive/hooks";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { DashboardMoveModal } from "metabase/dashboard/components/DashboardMoveModal";
import { ArchiveDashboardModal } from "metabase/dashboard/containers/ArchiveDashboardModal";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

export type DashboardModalType = "move" | "duplicate" | "trash";

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
  const navigate = useNavigate();
  const archive = useSetArchive();

  return match(modalType)
    .with("move", () => (
      <DashboardMoveModal dashboard={dashboard} onClose={onClose} />
    ))
    .with("duplicate", () => (
      <CollectionCopyEntityModal
        entityObject={{ ...dashboard, model: "dashboard" }}
        onClose={onClose}
        onSaved={(copy: Pick<Dashboard, "id">) => {
          onClose();
          navigate(Urls.dataStudioDashboard(copy.id));
        }}
      />
    ))
    .with("trash", () => (
      <ArchiveDashboardModal
        dashboard={dashboard}
        onArchive={() => archive({ model: "dashboard", id: dashboard.id })}
        onClose={onClose}
      />
    ))
    .exhaustive();
}
