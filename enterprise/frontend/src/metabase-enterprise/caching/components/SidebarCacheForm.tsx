import { useCallback, useMemo } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";
import type { SidebarCacheFormProps } from "metabase/plugins";
import { Button, Flex, Icon, Title } from "metabase/ui";
import type { Strategy } from "metabase-types/api";

import { SidebarCacheFormBody } from "./SidebarCacheForm.styled";
import { getItemId, getItemName } from "./utils";

const SidebarCacheForm_Base = ({
  item,
  model,
  setPage,
  ...groupProps
}: SidebarCacheFormProps) => {
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
    async (values: Strategy) => {
      await saveStrategy(values);
      setPage("default");
    },
    [saveStrategy, setPage],
  );

  const closeSidebar = useCallback(async () => {
    setPage("default");
  }, [setPage]);

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  const goBack = () => setPage("default");

  const headingId = `${model}-sidebar-caching-settings-heading`;

  return (
    <SidebarCacheFormBody
      align="flex-start"
      spacing="md"
      aria-labelledby={headingId}
      {...groupProps}
    >
      <Flex align="center">
        <BackButton
          onClick={() => {
            isStrategyFormDirty ? askBeforeDiscardingChanges(goBack) : goBack();
          }}
        />
        <Title order={2} id={headingId}>
          Caching settings
        </Title>
      </Flex>
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
          onReset={closeSidebar}
          buttonLabels={{ save: t`Save`, discard: t`Cancel` }}
          isInSidebar
        />
      </DelayedLoadingAndErrorWrapper>
      {confirmationModal}
    </SidebarCacheFormBody>
  );
};

export const SidebarCacheForm = withRouter(SidebarCacheForm_Base);

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    lh={0}
    style={{ marginInlineStart: ".5rem" }}
    variant="subtle"
    onClick={onClick}
  >
    <Icon name="chevronleft" color={color("text-dark")} />
  </Button>
);
