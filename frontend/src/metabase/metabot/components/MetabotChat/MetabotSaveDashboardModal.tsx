import { useMemo } from "react";
import { t } from "ttag";

import {
  CreateDashboardForm,
  type CreateDashboardProperties,
} from "metabase/common/CreateDashboard/CreateDashboardForm";
import { Modal } from "metabase/ui";
import type {
  AdhocDashcard,
  SaveMetabotDashboardResponse,
} from "metabase-types/api";

import { useSaveMetabotDashboardMutation } from "../../api";

export function MetabotSaveDashboardModal({
  conversationId,
  dashboardId,
  name,
  description,
  dashcards,
  onSaved,
  onClose,
}: {
  conversationId: string;
  dashboardId: string;
  name: string;
  description?: string;
  dashcards: AdhocDashcard[];
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
      generated_dashboard_id: dashboardId,
      dashboard: { ...values, dashcards },
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
        saveDashboard={handleSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}
