import { useFormikContext } from "formik";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { IconInButton } from "metabase/admin/performance/components/StrategyForm.styled";
import { isErrorWithMessage } from "metabase/admin/performance/strategies";
import { Form, FormProvider } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { CacheConfigApi } from "metabase/services";
import { Group, Loader, Text } from "metabase/ui";

import { StyledInvalidateNowButton } from "./InvalidateNowButton.styled";

const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export const InvalidateNowButton = ({
  targetId,
  containerRef,
  databaseName,
}: {
  targetId: number;
  containerRef: React.RefObject<HTMLElement>;
  databaseName?: string;
}) => {
  const dispatch = useDispatch();

  const invalidateTargetDatabase = useCallback(async () => {
    try {
      const invalidate = CacheConfigApi.invalidate(
        { include: "overrides", database: targetId },
        { hasBody: false },
      );
      // To prevent UI jumpiness, ensure a minimum delay before showing the success/failure message
      await Promise.all([delay(300), invalidate]);
    } catch (e) {
      if (isErrorWithMessage(e)) {
        dispatch(
          addUndo({
            icon: "warning",
            message: e.data.message,
            toastColor: "error",
            dismissIconColor: "white",
          }),
        );
      }
      throw e;
    }
  }, [dispatch, targetId]);

  if (!containerRef.current) {
    return null;
  }

  return createPortal(
    <>
      <FormProvider initialValues={{}} onSubmit={invalidateTargetDatabase}>
        <InvalidateNowFormBody databaseName={databaseName} />
      </FormProvider>
    </>,
    containerRef.current,
  );
};

const InvalidateNowFormBody = ({ databaseName }: { databaseName?: string }) => {
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const { submitForm } = useFormikContext();

  const confirmInvalidation = useCallback(
    () =>
      askConfirmation({
        title: t`Invalidate all cached results for ${
          databaseName || t`this database`
        }?`,
        message: "",
        confirmButtonText: t`Invalidate`,
        onConfirm: submitForm,
      }),
    [askConfirmation, databaseName, submitForm],
  );

  return (
    <>
      <Form>
        <StyledInvalidateNowButton
          onClick={e => {
            confirmInvalidation();
            e.preventDefault();
            return false;
          }}
          label={
            <Group spacing="sm">
              <IconInButton color={color("danger")} name="trash" />
              <Text>Invalidate cache now</Text>
            </Group>
          }
          activeLabel={
            <Group spacing="sm">
              <Loader size="1rem" />
              <Text>Invalidating… </Text>
            </Group>
          }
          successLabel={
            <Group spacing="sm">
              <IconInButton name="check" color={color("success")} />
              <Text>Done</Text>
            </Group>
          }
          failedLabel={
            <Text fw="bold" lh="1">
              Error
            </Text>
          }
        />
      </Form>
      {confirmationModal}
    </>
  );
};
