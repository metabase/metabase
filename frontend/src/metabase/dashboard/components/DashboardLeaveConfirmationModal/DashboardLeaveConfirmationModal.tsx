import { t } from "ttag";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";
import { updateDashboardAndCards } from "metabase/dashboard/actions/save";
import { getIsDirty, getIsEditing } from "metabase/dashboard/selectors";
import { useDispatch, useSelector, useStore } from "metabase/redux";
import { dismissAllUndo } from "metabase/redux/undo";
import { Box, Button, Flex, Modal, Text } from "metabase/ui";

import { isNavigatingToCreateADashboardQuestion } from "./utils";

export const DashboardLeaveConfirmationModal = () => {
  const isEditing = useSelector(getIsEditing);
  const isDirty = useSelector(getIsDirty);

  const dispatch = useDispatch();
  const store = useStore();

  const { opened, close, confirm, nextLocation } = useConfirmRouteLeaveModal({
    isEnabled: isEditing && isDirty,
    // Save and Cancel navigate right after leaving edit mode, before this
    // re-renders, so the store is the only up-to-date source
    isLocationAllowed: () => !getIsEditing(store.getState()),
  });

  const content = isNavigatingToCreateADashboardQuestion(nextLocation)
    ? {
        title: t`Save your changes?`,
        message: t`You’ll need to save your changes before leaving to create a new question.`,
        actionBtn: {
          message: t`Save changes`,
        },
        // No location: leaving edit mode must not navigate over the pending one
        onConfirm: () => dispatch(updateDashboardAndCards()),
      }
    : {
        title: t`Discard your changes?`,
        message: t`Your changes haven’t been saved, so you’ll lose them if you navigate away.`,
        actionBtn: {
          color: "negative" as const,
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
        <Text lh="1.5rem" mb={"xl"}>
          {content.message}
        </Text>
        <Flex justify="flex-end" gap="lg">
          <Button onClick={close}>{t`Cancel`}</Button>
          <Button
            color={content.actionBtn.color}
            variant="filled"
            onClick={async () => {
              dispatch(dismissAllUndo());
              await content.onConfirm?.();
              confirm?.();
            }}
          >
            {content.actionBtn.message}
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
};
