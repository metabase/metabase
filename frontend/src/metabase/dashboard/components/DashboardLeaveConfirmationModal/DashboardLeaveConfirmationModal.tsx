import { type Route, type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import { updateDashboardAndCards } from "metabase/dashboard/actions/save";
import { useConfirmLeaveModal } from "metabase/hooks/use-confirm-leave-modal";
import { useDispatch } from "metabase/lib/redux";
import { dismissAllUndo } from "metabase/redux/undo";
import { Modal } from "metabase/ui";

import { isNavigatingToCreateADashboardQuestion } from "./utils";

interface DashboardLeaveConfirmationModalProps extends WithRouterProps {
  isEditing: boolean;
  isDirty: boolean;
  route: Route;
}

export const DashboardLeaveConfirmationModal = withRouter(
  ({
    isEditing,
    isDirty,
    router,
    route,
  }: DashboardLeaveConfirmationModalProps) => {
    const dispatch = useDispatch();

    const { opened, close, confirm, nextLocation } = useConfirmLeaveModal({
      isEnabled: isEditing && isDirty,
      route,
      router,
    });

    const onSave = async () => {
      dispatch(dismissAllUndo());
      await dispatch(updateDashboardAndCards());
    };

    return (
      <Modal opened={opened} onClose={close} size="md">
        {isNavigatingToCreateADashboardQuestion(nextLocation) ? (
          <ConfirmContent
            cancelButtonText={t`Cancel`}
            confirmButtonText={t`Save changes and go`}
            confirmButtonPrimary
            data-testid="leave-for-new-dashboard-question-confirmation"
            message={t`That’ll keep things tidy.`}
            title={t`Let’s save your changes and create your new question`}
            onAction={async () => {
              await onSave();
              confirm?.();
            }}
            onClose={close}
          />
        ) : (
          <LeaveConfirmationModalContent onAction={confirm} onClose={close} />
        )}
      </Modal>
    );
  },
);
