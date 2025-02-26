import { useFormikContext } from "formik";
import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { IconInButton } from "metabase/admin/performance/components/StrategyForm.styled";
import { useInvalidateTarget } from "metabase/admin/performance/hooks/useInvalidateTarget";
import { useIsFormPending } from "metabase/admin/performance/hooks/useIsFormPending";
import type { ModelWithClearableCache } from "metabase/admin/performance/types";
import { Form, FormProvider } from "metabase/forms";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { color } from "metabase/lib/colors";
import type { InvalidateNowButtonProps } from "metabase/plugins";
import { Group, Icon, Loader, Text } from "metabase/ui";

import { StyledInvalidateNowButton } from "./InvalidateNowButton.styled";

/** Button that clears the cache of a particular object (the "target") */
export const InvalidateNowButton = ({
  targetId,
  targetModel,
  targetName,
}: InvalidateNowButtonProps) => {
  const invalidateTarget = useInvalidateTarget(targetId, targetModel);
  return (
    <FormProvider initialValues={{}} onSubmit={invalidateTarget}>
      <InvalidateNowFormBody
        targetModel={targetModel}
        targetName={targetName}
      />
    </FormProvider>
  );
};

const InvalidateNowFormBody = ({
  targetName,
  targetModel,
}: {
  targetName?: string;
  targetModel: ModelWithClearableCache;
}) => {
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

  const buttonText = useMemo(
    () =>
      match(targetModel)
        .with("dashboard", () => t`Clear cache for this dashboard`)
        .with("question", () => t`Clear cache for this question`)
        .with("database", () => t`Clear cache for this database`)
        .exhaustive(),
    [targetModel],
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
            <Group gap="sm">
              <Icon color="var(--mb-color-danger)" name="trash" />
              <Text>{buttonText}</Text>
            </Group>
          }
          activeLabel={
            <Group gap="sm">
              <Loader size="1rem" />
              <Text>{c("Shown when a cache is being cleared")
                .t`Clearing cache… `}</Text>
            </Group>
          }
          successLabel={
            <Group gap="sm">
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
