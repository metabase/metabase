import type { Location } from "history";
import type { ReactNode } from "react";
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
  children?: (props: {
    nextLocation: Location | undefined;
    onAction?: () => void;
    onClose?: () => void;
  }) => ReactNode;
}

const LeaveConfirmationModalBase = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
  children,
}: Props) => {
  const { opened, close, confirm, nextLocation } = useConfirmLeaveModal({
    isEnabled,
    isLocationAllowed,
    route,
    router,
  });

  return (
    <Modal isOpen={opened}>
      {children ? (
        children({
          nextLocation,
          onAction: confirm,
          onClose: close,
        })
      ) : (
        <LeaveConfirmationModalContent onAction={confirm} onClose={close} />
      )}
    </Modal>
  );
};

export const LeaveConfirmationModal = withRouter(LeaveConfirmationModalBase);
