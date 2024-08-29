import { useCallback, useMemo } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { SidesheetSubPage } from "metabase/common/components/Sidesheet";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { SidebarCacheFormProps } from "metabase/plugins";
import type { CacheStrategy } from "metabase-types/api";

import { SidebarCacheFormBody } from "./SidebarCacheForm.styled";
import { getItemId, getItemName } from "./utils";

const SidebarCacheForm_Base = ({
  item,
  model,
  onClose,
  onBack,
  ...groupProps
}: SidebarCacheFormProps & { onBack: () => void }) => {
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
  const saveAndCloseSidebar = useCallback(
    async (values: CacheStrategy) => {
      await saveStrategy(values);
      onClose();
    },
    [saveStrategy, onClose],
  );

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  const headingId = `${model}-sidebar-caching-settings-heading`;

  return (
    <SidesheetSubPage
      isOpen
      title={t`Cache settings`}
      onBack={() =>
        isStrategyFormDirty ? askBeforeDiscardingChanges(onClose) : onClose()
      }
      onClose={onClose}
    >
      <SidebarCacheFormBody
        align="flex-start"
        spacing="md"
        aria-labelledby={headingId}
        {...groupProps}
      >
        <DelayedLoadingAndErrorWrapper loading={loading} error={error}>
          <StrategyForm
            targetId={id}
            targetModel={model}
            targetName={getItemName(model, item)}
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveAndCloseSidebar}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation
            shouldShowName={false}
            onReset={onClose}
            buttonLabels={{ save: t`Save`, discard: t`Cancel` }}
            isInSidebar
          />
        </DelayedLoadingAndErrorWrapper>
        {confirmationModal}
      </SidebarCacheFormBody>
    </SidesheetSubPage>
  );
};

export const SidebarCacheForm = withRouter(SidebarCacheForm_Base);
