import type { Location } from "history";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";

import Modal from "metabase/components/Modal";
import { useConfirmLeaveModal } from "metabase/hooks/use-confirm-leave-modal";

import { LeaveConfirmationModalContent } from "./LeaveConfirmationModalContent";

interface Props {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  route: Route;
  router: InjectedRouter;
}

const LeaveConfirmationModalBase = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
}: Props) => {
  const { opened, close, confirm } = useConfirmLeaveModal({
    isEnabled,
    isLocationAllowed,
    route,
    router,
  });

  return (
    <Modal isOpen={opened}>
      <LeaveConfirmationModalContent onAction={confirm} onClose={close} />
    </Modal>
  );
};

export const LeaveConfirmationModal = withRouter(LeaveConfirmationModalBase);
