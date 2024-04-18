import { useFormikContext } from "formik";
import { useCallback } from "react";
import { c, t } from "ttag";

import { IconInButton } from "metabase/admin/performance/components/StrategyForm.styled";
import {
  isErrorWithMessage,
  resolveSmoothly,
} from "metabase/admin/performance/utils";
import { Form, FormProvider } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import type { InvalidateNowButtonProps } from "metabase/plugins";
import { addUndo } from "metabase/redux/undo";
import { CacheConfigApi } from "metabase/services";
import { Group, Icon, Loader, Text } from "metabase/ui";

import { StyledInvalidateNowButton } from "./InvalidateNowButton.styled";
export const InvalidateNowButton = ({
  targetId,
  targetName,
}: InvalidateNowButtonProps) => {
  const dispatch = useDispatch();

  const invalidateTargetDatabase = useCallback(async () => {
    try {
      const invalidate = CacheConfigApi.invalidate(
        { include: "overrides", database: targetId },
        { hasBody: false },
      );
      await resolveSmoothly(invalidate);
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

  return (
    <FormProvider initialValues={{}} onSubmit={invalidateTargetDatabase}>
      <InvalidateNowFormBody targetName={targetName} />
    </FormProvider>
  );
};

const InvalidateNowFormBody = ({ targetName }: { targetName?: string }) => {
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const { submitForm } = useFormikContext();

  const confirmInvalidation = useCallback(
    () =>
      askConfirmation({
        title: t`Invalidate all cached results for ${
          targetName || t`this object`
        }?`,
        message: "",
        confirmButtonText: t`Invalidate`,
        onConfirm: submitForm,
      }),
    [askConfirmation, targetName, submitForm],
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
              <Icon color={color("danger")} name="trash" />
              <Text>{t`Invalidate cache now`}</Text>
            </Group>
          }
          activeLabel={
            <Group spacing="sm">
              <Loader size="1rem" />
              <Text>{c("Shown when a cache is being invalidated")
                .t`Invalidating… `}</Text>
            </Group>
          }
          successLabel={
            <Group spacing="sm">
              <IconInButton name="check" color={color("success")} />
              <Text>{t`Done`}</Text>
            </Group>
          }
          failedLabel={
            <Text fw="bold" lh="1">
              {t`Error`}
            </Text>
          }
        />
      </Form>
      {confirmationModal}
    </>
  );
};
