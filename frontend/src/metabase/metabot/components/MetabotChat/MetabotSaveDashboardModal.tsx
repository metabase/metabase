import { useMemo } from "react";
import { t } from "ttag";

import {
  CreateDashboardForm,
  type CreateDashboardProperties,
} from "metabase/common/CreateDashboard/CreateDashboardForm";
import { Modal } from "metabase/ui";
import type {
  AdhocDashboardTile,
  SaveMetabotDashboardResponse,
} from "metabase-types/api";

import { useSaveMetabotDashboardMutation } from "../../api";

export function MetabotSaveDashboardModal({
  conversationId,
  dashboardId,
  name,
  description,
  tiles,
  onSaved,
  onClose,
}: {
  conversationId: string;
  dashboardId: string;
  name: string;
  description?: string;
  tiles: AdhocDashboardTile[];
  onSaved: (saved: SaveMetabotDashboardResponse) => void;
  onClose: () => void;
}) {
  const [saveMetabotDashboard] = useSaveMetabotDashboardMutation();
  const initialValues = useMemo(
    () => ({ name, description: description ?? null }),
    [name, description],
  );

  const handleSubmit = async (values: CreateDashboardProperties) => {
    const saved = await saveMetabotDashboard({
      conversation_id: conversationId,
      dashboard_id: dashboardId,
      dashboard: { ...values, tiles },
    }).unwrap();
    onSaved(saved);
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={t`Save dashboard`}
      data-testid="save-dashboard-modal"
    >
      <CreateDashboardForm
        initialValues={initialValues}
        submitLabel={t`Save`}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}
