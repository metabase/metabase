import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { SidesheetSubPage } from "metabase/common/components/Sidesheet";
import type { SidebarCacheFormProps } from "metabase/plugins";
import { Stack } from "metabase/ui";
import type { CacheStrategy } from "metabase-types/api";

import { getItemId, getItemName } from "./utils";

export const SidebarCacheForm = ({
  item,
  model,
  isOpen,
  onClose,
  withOverlay = true,
  overlayProps,
  onBack,
  ...stackProps
}: SidebarCacheFormProps) => {
  const configurableModels = useMemo(() => [model], [model]);
  const id: number = getItemId(model, item);
  const { configs, isLoading, error } = useCacheConfigs({
    model: configurableModels,
    id,
  });

  const { savedStrategy } = useMemo(() => {
    const targetConfig = _.findWhere(configs ?? [], { model_id: id });
    const savedStrategy = targetConfig?.strategy;
    return { savedStrategy };
  }, [configs, id]);

  const saveStrategy = useSaveStrategy(id, model);
  const saveAndBack = useCallback(
    async (values: CacheStrategy) => {
      await saveStrategy(values);
      onBack();
    },
    [saveStrategy, onBack],
  );

  const {
    confirmationModal,
    setIsStrategyFormDirty,
    isStrategyFormDirty,
    askBeforeDiscardingChanges,
  } = useConfirmIfFormIsDirty();

  const headingId = `${model}-sidebar-caching-settings-heading`;

  return (
    <SidesheetSubPage
      title={t`Caching settings`}
      isOpen={isOpen}
      onClose={() =>
        isStrategyFormDirty ? askBeforeDiscardingChanges(onClose) : onClose()
      }
      withOverlay={withOverlay}
      overlayProps={overlayProps}
      onBack={() =>
        isStrategyFormDirty ? askBeforeDiscardingChanges(onBack) : onBack()
      }
    >
      <Stack
        align="space-between"
        h="calc(100% + 2.5rem)" // to make bottom padding nice with scroll containers
        gap="md"
        aria-labelledby={headingId}
        {...stackProps}
      >
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
          <StrategyForm
            targetId={id}
            targetModel={model}
            targetName={getItemName(model, item)}
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveAndBack}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation
            shouldShowName={false}
            onReset={onBack}
            buttonLabels={{ save: t`Save`, discard: t`Cancel` }}
            isInSidebar
          />
        </DelayedLoadingAndErrorWrapper>
        {confirmationModal}
      </Stack>
    </SidesheetSubPage>
  );
};
