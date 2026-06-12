import { useFormikContext } from "formik";
import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { useInvalidateTarget } from "metabase/admin/performance/hooks/useInvalidateTarget";
import { useIsFormPending } from "metabase/admin/performance/hooks/useIsFormPending";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { FormProvider, FormSubmitButton } from "metabase/forms";
import type {
  InvalidateNowButtonProps,
  ModelWithClearableCache,
} from "metabase/plugins";
import { Group, Icon, Loader, Text } from "metabase/ui";

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
        .with("metric", () => t`Clear cache for this metric`)
        .exhaustive(),
    [targetModel],
  );

  // Nested `<form>` would be invalid HTML; the parent `StrategyForm` owns the form element.
  return (
    <>
      <FormSubmitButton
        onClick={(e) => {
          confirmInvalidation();
          e.preventDefault();
          return false;
        }}
        disabled={wasFormRecentlyPending}
        variant="subtle"
        c="error"
        px="sm"
        leftSection={<Icon name="trash" />}
        label={buttonText}
        activeLabel={
          <Group gap="sm" align="center">
            <Loader size="1rem" />
            <Text>{c("Shown when a cache is being cleared")
              .t`Clearing cache… `}</Text>
          </Group>
        }
        successLabel={
          <Group gap="sm" align="center">
            <Icon name="check" c="success" />
            <Text>{t`Cache cleared`}</Text>
          </Group>
        }
        failedLabel={
          <Text fw="bold" lh="1">
            {t`Error`}
          </Text>
        }
      />

      {confirmationModal}
    </>
  );
};
