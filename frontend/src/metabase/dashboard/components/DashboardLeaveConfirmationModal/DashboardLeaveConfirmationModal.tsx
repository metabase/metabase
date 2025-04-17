import { type Route, type WithRouterProps, withRouter } from "react-router";
import { t } from "ttag";

import { updateDashboardAndCards } from "metabase/dashboard/actions/save";
import { useConfirmRouteLeaveModal } from "metabase/hooks/use-confirm-route-leave-modal";
import { useDispatch } from "metabase/lib/redux";
import { dismissAllUndo } from "metabase/redux/undo";
import { Box, Button, Flex, Modal, Text } from "metabase/ui";

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
      <Modal
        opened={opened}
        onClose={close}
        size="28.5rem"
        padding="2.5rem"
        title={content.title}
        data-testid="leave-confirmation"
        withCloseButton={false}
        styles={{
          title: {
            fontSize: "1rem",
          },
          header: {
            marginBottom: "0.5rem",
          },
        }}
      >
        <Box>
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
        </Box>
      </Modal>
    );
  },
);
