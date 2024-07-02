import { useFormikContext } from "formik";
import { useCallback } from "react";
import { c, t } from "ttag";

import { IconInButton } from "metabase/admin/performance/components/StrategyForm.styled";
import { useInvalidateTarget } from "metabase/admin/performance/hooks/useInvalidateTarget";
import { useIsFormPending } from "metabase/admin/performance/hooks/useIsFormPending";
import { Form, FormProvider } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { color } from "metabase/lib/colors";
import type { InvalidateNowButtonProps } from "metabase/plugins";
import { Group, Icon, Loader, Text } from "metabase/ui";

import { StyledInvalidateNowButton } from "./InvalidateNowButton.styled";

export const InvalidateNowButton = ({
  targetId,
  targetModel,
  targetName,
}: InvalidateNowButtonProps) => {
  const invalidateTarget = useInvalidateTarget(targetId, targetModel);
  return (
    <FormProvider initialValues={{}} onSubmit={invalidateTarget}>
      <InvalidateNowFormBody targetName={targetName} />
    </FormProvider>
  );
};

const InvalidateNowFormBody = ({ targetName }: { targetName?: string }) => {
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const { submitForm } = useFormikContext();
  const { wasFormRecentlyPending } = useIsFormPending(5000);

  const confirmInvalidation = useCallback(
    () =>
      askConfirmation({
        title: targetName
          ? t`Clear all cached results for ${targetName}?`
          : t`Clear all cached results for this object?`,
        message: "",
        confirmButtonText: t`Clear cache`,
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
          disabled={wasFormRecentlyPending}
          label={
            <Group spacing="sm">
              <Icon color={color("danger")} name="trash" />
              <Text>{t`Clear cache`}</Text>
            </Group>
          }
          activeLabel={
            <Group spacing="sm">
              <Loader size="1rem" />
              <Text>{c("Shown when a cache is being cleared")
                .t`Clearing cache… `}</Text>
            </Group>
          }
          successLabel={
            <Group spacing="sm">
              <IconInButton name="check" color={color("success")} />
              <Text>{t`Cache cleared`}</Text>
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
