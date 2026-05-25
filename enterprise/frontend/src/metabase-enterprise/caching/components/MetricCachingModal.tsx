import { useCallback } from "react";
import { t } from "ttag";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { MetricCachingModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";
import type { CacheStrategy } from "metabase-types/api";

export function MetricCachingModal({
  cardId,
  cardName,
  onClose,
}: MetricCachingModalProps) {
  // Metric cache configs live under the `question` model on the API (metrics
  // are `card`s in the backend); the writer hook handles the metric → question
  // translation, but the reader takes the API-side model name directly. The
  // array literal is re-created per render — fine, RTK Query keys the cache by
  // serialized args, not reference identity.
  const { configs, isLoading, error } = useCacheConfigs({
    model: ["question"],
    id: cardId,
  });

  const savedStrategy = configs?.find(
    (config) => config.model_id === cardId,
  )?.strategy;

  const saveStrategy = useSaveStrategy(cardId, "metric");

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
      title={t`Caching`}
      size="lg"
      padding="xl"
    >
      <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
        <StrategyForm
          targetId={cardId}
          targetModel="metric"
          targetName={cardName}
          setIsDirty={setIsStrategyFormDirty}
          saveStrategy={handleSaveAndClose}
          savedStrategy={savedStrategy}
          shouldAllowInvalidation
          shouldShowName={false}
          onReset={onClose}
          layout="modal"
        />
      </DelayedLoadingAndErrorWrapper>
      {confirmationModal}
    </Modal>
  );
}
