import { useCallback, useMemo } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import {
  SidesheetCard,
  SidesheetSubPage,
} from "metabase/common/components/Sidesheet";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { QuestionCachingStrategySidebarProps } from "metabase/plugins";
import { Stack } from "metabase/ui";
import type { CacheStrategy } from "metabase-types/api";

import { getItemId, getItemName } from "./utils";

const _QuestionCachingStrategySidebar = ({
  item,
  model,
  onClose,
  onBack,
  ...groupProps
}: QuestionCachingStrategySidebarProps & { onBack: () => void }) => {
  const configurableModels = useMemo(() => [model], [model]);
  const id: number = getItemId(model, item);
  const { configs, setConfigs, loading, error } = useCacheConfigs({
    configurableModels,
    id,
  });

  const { savedStrategy, filteredConfigs } = useMemo(() => {
    const targetConfig = _.findWhere(configs, { model_id: id });
    const savedStrategy = targetConfig?.strategy;
    const filteredConfigs = _.compact([targetConfig]);
    return { savedStrategy, filteredConfigs };
  }, [configs, id]);

  const saveStrategy = useSaveStrategy(id, filteredConfigs, setConfigs, model);
  const saveAndBack = useCallback(
    async (values: CacheStrategy) => {
      await saveStrategy(values);
      onBack();
    },
    [saveStrategy, onBack],
  );

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  const headingId = `question-sidebar-caching-settings-heading`;

  return (
    <SidesheetSubPage
      isOpen
      title={t`Caching settings`}
      onBack={() =>
        isStrategyFormDirty ? askBeforeDiscardingChanges(onBack) : onBack()
      }
      onClose={onClose}
      data-testid="question-caching-strategy-sidebar"
    >
      <Stack
        align="space-between"
        h="calc(100% + 2.5rem)" // to make bottom padding nice with scroll containers
        spacing="md"
        aria-labelledby={headingId}
        {...groupProps}
      >
        <DelayedLoadingAndErrorWrapper loading={loading} error={error}>
          <SidesheetCard>
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
          </SidesheetCard>
        </DelayedLoadingAndErrorWrapper>
        {confirmationModal}
      </Stack>
    </SidesheetSubPage>
  );
};

export const QuestionCachingStrategySidebar = withRouter(
  _QuestionCachingStrategySidebar,
);
