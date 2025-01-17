import { type Route, type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import { updateDashboardAndCards } from "metabase/dashboard/actions/save";
import { useConfirmRouteLeaveModal } from "metabase/hooks/use-confirm-route-leave-modal";
import { useDispatch } from "metabase/lib/redux";
import { dismissAllUndo } from "metabase/redux/undo";
import { Button, Flex, Modal, Text } from "metabase/ui";

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

    const { opened, close, confirm, nextLocation } = useConfirmRouteLeaveModal({
      isEnabled: isEditing && isDirty,
      route,
      router,
    });

    const onSave = async () => {
      dispatch(dismissAllUndo());
      await dispatch(updateDashboardAndCards());
      confirm?.();
    };

    const content = isNavigatingToCreateADashboardQuestion(nextLocation)
      ? {
          title: t`Save your changes?`,
          message: t`You’ll need to save your changes before leaving to create a new question.`,
          actionBtn: {
            color: "primary",
            message: t`Save changes`,
          },
        }
      : {
          title: t`Discard your changes?`,
          message: t`Your changes haven’t been saved, so you’ll lose them if you navigate away.`,
          actionBtn: {
            color: "danger",
            message: t`Discard changes`,
          },
        };

    return (
      <Modal.Root opened={opened} onClose={close} size="28.5rem">
        <Modal.Overlay />
        <Modal.Content data-testid="leave-confirmation">
          <Modal.Header p="2.5rem 3rem" mb="sm">
            <Modal.Title fz="1rem" color="text-primary">
              {content.title}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body p="2.5rem 3rem">
            <Text lh="1.5rem" mb={"lg"}>
              {content.message}
            </Text>
            <Flex justify="flex-end" gap="md">
              <Button onClick={close}>{t`Cancel`}</Button>
              <Button
                color={content.actionBtn.color}
                variant="filled"
                onClick={onSave}
              >
                {content.actionBtn.message}
              </Button>
            </Flex>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    );
  },
);
