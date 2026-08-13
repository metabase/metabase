import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { SidebarCacheSectionProps } from "metabase/plugins";
import { Flex, UnstyledButton } from "metabase/ui";

import S from "./SidebarCacheSection.module.css";
import { getItemId } from "./utils";

/** Displays the current cache invalidation strategy and provides a button that opens the cache configuration form */
export const SidebarCacheSection = ({
  item,
  model,
  setPage,
}: SidebarCacheSectionProps) => {
  const id = useMemo(() => getItemId(model, item), [model, item]);
  const configurableModels = useMemo(() => [model], [model]);

  const { configs, isLoading, error } = useCacheConfigs({
    model: configurableModels,
    id,
  });

  const targetConfig = useMemo(() => {
    const id = getItemId(model, item);
    return _.findWhere(configs ?? [], { model, model_id: id });
  }, [configs, model, item]);
  const savedStrategy = targetConfig?.strategy;

  const shortStrategyLabel =
    getShortStrategyLabel(savedStrategy, model) || t`Default`;
  const labelId = "question-caching-policy-label";

  return (
    <DelayedLoadingAndErrorWrapper delay={0} loading={isLoading} error={error}>
      <Flex align="center" justify="space-between">
        <span id={labelId}>{t`When to get new results`}</span>
        <UnstyledButton
          fw="bold"
          className={S.formLauncher}
          onClick={() => setPage("caching")}
          aria-labelledby={labelId}
        >
          {shortStrategyLabel}
        </UnstyledButton>
      </Flex>
    </DelayedLoadingAndErrorWrapper>
  );
};
