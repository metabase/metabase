import { t } from "ttag";

import { updateDashboardAndCards } from "metabase/dashboard/actions/save";
import { getIsDirty, getIsEditing } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { dismissAllUndo } from "metabase/redux/undo";
import { useBlockNavigation } from "metabase/routing/compat";
import { Box, Button, Flex, Modal, Text } from "metabase/ui";

import { isNavigatingToCreateADashboardQuestion } from "./utils";

/**
 * Modal that confirms navigation away from the dashboard when there are
 * unsaved changes during edit mode.
 *
 * Uses useBlockNavigation which automatically obtains router/route from context.
 */
export const DashboardLeaveConfirmationModal = () => {
  const isEditing = useSelector(getIsEditing);
  const isDirty = useSelector(getIsDirty);

  const dispatch = useDispatch();

  const { isBlocked, cancel, proceed, nextLocation } = useBlockNavigation({
    isEnabled: isEditing && isDirty,
  });

    const content = isNavigatingToCreateADashboardQuestion(nextLocation)
      ? {
          title: t`Save your changes?`,
          message: t`You'll need to save your changes before leaving to create a new question.`,
          actionBtn: {
            message: t`Save changes`,
          },
          onConfirm: () => dispatch(updateDashboardAndCards()),
        }
      : {
          title: t`Discard your changes?`,
          message: t`Your changes haven't been saved, so you'll lose them if you navigate away.`,
          actionBtn: {
            color: "danger" as const,
            message: t`Discard changes`,
          },
        };

    return (
      <Modal
        opened={isBlocked}
        onClose={cancel}
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
            <Button onClick={cancel}>{t`Cancel`}</Button>
            <Button
              color={content.actionBtn.color}
              variant="filled"
              onClick={async () => {
                dispatch(dismissAllUndo());
                await content.onConfirm?.();
                proceed?.();
              }}
            >
              {content.actionBtn.message}
            </Button>
          </Flex>
        </Box>
      </Modal>
    );
};
