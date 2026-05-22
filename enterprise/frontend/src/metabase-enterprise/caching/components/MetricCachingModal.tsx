import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { FormSubmitButton } from "metabase/forms";
import type { MetricCachingModalProps } from "metabase/plugins";
import { Button, Group, Modal, Title } from "metabase/ui";
import type { CacheStrategy, CacheableModel } from "metabase-types/api";

import { InvalidateNowButton } from "./InvalidateNowButton";

/** Metric cache configs are stored under the `question` model on the API
 * (metrics are `card`s in the backend); the writer hook handles the
 * `metric → question` translation internally, but the reader takes the
 * API-side model name directly. */
const CACHING_MODEL: CacheableModel[] = ["question"];

export function MetricCachingModal({ card, onClose }: MetricCachingModalProps) {
  const { configs, isLoading, error } = useCacheConfigs({
    model: CACHING_MODEL,
    id: card.id,
  });

  const { savedStrategy } = useMemo(() => {
    const targetConfig = (configs ?? []).find(
      (config) => config.model_id === card.id,
    );
    return { savedStrategy: targetConfig?.strategy };
  }, [configs, card.id]);

  const saveStrategy = useSaveStrategy(card.id, "metric");

  const {
    confirmationModal,
    setIsStrategyFormDirty,
    isStrategyFormDirty,
    askBeforeDiscardingChanges,
  } = useConfirmIfFormIsDirty();

  const handleClose = useCallback(() => {
    if (isStrategyFormDirty) {
      askBeforeDiscardingChanges(onClose);
    } else {
      onClose();
    }
  }, [isStrategyFormDirty, askBeforeDiscardingChanges, onClose]);

  const handleSaveAndClose = useCallback(
    async (values: CacheStrategy) => {
      await saveStrategy(values);
      onClose();
    },
    [saveStrategy, onClose],
  );

  return (
    <Modal
      opened
      onClose={handleClose}
      title={<Title order={3}>{t`Caching`}</Title>}
      size="lg"
      padding="xl"
    >
      <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
        <StrategyForm
          targetId={card.id}
          targetModel="metric"
          targetName={card.name}
          setIsDirty={setIsStrategyFormDirty}
          saveStrategy={handleSaveAndClose}
          savedStrategy={savedStrategy}
          shouldAllowInvalidation
          shouldShowName={false}
          onReset={onClose}
          formBoxProps={{ p: 0 }}
          renderFooter={() => (
            <MetricCachingModalFooter cardId={card.id} cardName={card.name} />
          )}
        />
      </DelayedLoadingAndErrorWrapper>
      {confirmationModal}
    </Modal>
  );
}

function MetricCachingModalFooter({
  cardId,
  cardName,
}: {
  cardId: number;
  cardName: string;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" mt="xl" gap="md">
      <InvalidateNowButton
        targetId={cardId}
        targetModel="metric"
        targetName={cardName}
      />
      <Group gap="md" wrap="nowrap">
        <Button type="reset">{t`Cancel`}</Button>
        <FormSubmitButton
          h="40px"
          label={t`Save`}
          variant="filled"
          data-testid="strategy-form-submit-button"
          className="strategy-form-submit-button"
        />
      </Group>
    </Group>
  );
}
