import { useState } from "react";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { PLUGIN_TENANTS } from "metabase/plugins";

import { SetupGuideXrayPickerModal } from "../components/SetupGuideXrayPickerModal";
import type { SetupGuideModalToTrigger } from "../types/setup-guide";

// Fallback for callers that do not say where they are.
const DEFAULT_SETUP_GUIDE_PATH = "/embedding/get-started";

/**
 * The checklist's modals and the state that opens them, so the stepper on the
 * home page and the card grid in the embedding hub drive the same set rather
 * than keeping two copies in sync.
 *
 * @param returnTo path of the guide that is rendering these modals. Flows that
 * leave the guide -- connecting a database, for one -- carry it so they can
 * return to the host the user actually started from.
 */
export function useSetupGuideModals({
  returnTo = DEFAULT_SETUP_GUIDE_PATH,
}: { returnTo?: string } = {}) {
  const [openedModal, setOpenedModal] =
    useState<SetupGuideModalToTrigger | null>(null);

  const closeModal = () => setOpenedModal(null);

  const modals = (
    <>
      <AddDataModal
        opened={openedModal?.type === "add-data"}
        onClose={closeModal}
        initialTab={
          openedModal?.type === "add-data" ? openedModal.initialTab : undefined
        }
        returnToSetupGuide={returnTo}
      />
      <CreateDashboardModal
        opened={openedModal?.type === "new-dashboard"}
        onClose={closeModal}
      />
      <SetupGuideXrayPickerModal
        opened={openedModal?.type === "xray-dashboard"}
        onClose={closeModal}
      />
      {openedModal?.type === "user-strategy" && (
        <PLUGIN_TENANTS.EditUserStrategyModal onClose={closeModal} />
      )}
    </>
  );

  return { setOpenedModal, modals };
}
