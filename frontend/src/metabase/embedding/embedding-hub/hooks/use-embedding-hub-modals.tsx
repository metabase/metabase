import { useState } from "react";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { PLUGIN_TENANTS } from "metabase/plugins";

import { EmbeddingHubXrayPickerModal } from "../components/EmbeddingHubXrayPickerModal";
import type { EmbeddingHubModalToTrigger } from "../types/embedding-checklist";

/**
 * The checklist's modals and the state that opens them, so the stepper on the
 * home page and the card grid in the embedding hub drive the same set rather
 * than keeping two copies in sync.
 */
export function useEmbeddingHubModals() {
  const [openedModal, setOpenedModal] =
    useState<EmbeddingHubModalToTrigger | null>(null);

  const closeModal = () => setOpenedModal(null);

  const modals = (
    <>
      <AddDataModal
        opened={openedModal?.type === "add-data"}
        onClose={closeModal}
        initialTab={
          openedModal?.type === "add-data" ? openedModal?.initialTab : undefined
        }
        fromEmbeddingSetupGuide
      />
      <CreateDashboardModal
        opened={openedModal?.type === "new-dashboard"}
        onClose={closeModal}
      />
      <EmbeddingHubXrayPickerModal
        opened={openedModal?.type === "xray-dashboard"}
        onClose={closeModal}
      />
      {openedModal?.type === "user-strategy" && (
        <PLUGIN_TENANTS.EditUserStrategyModal onClose={closeModal} />
      )}
    </>
  );

  return { openedModal, setOpenedModal, closeModal, modals };
}
