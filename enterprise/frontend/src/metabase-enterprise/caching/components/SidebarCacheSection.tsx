import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { SidebarCacheSectionProps } from "metabase/plugins";
import { Flex } from "metabase/ui";

import { FormLauncher } from "./SidebarCacheSection.styled";
import { getItemId } from "./utils";

/** Displays the current cache invalidation strategy and provides a button that opens the cache configuration form */
export const SidebarCacheSection = ({
  item,
  model,
  setPage,
}: SidebarCacheSectionProps) => {
  const id = useMemo(() => getItemId(model, item), [model, item]);
  const configurableModels = useMemo(() => [model], [model]);

  const { configs, loading, error } = useCacheConfigs({
    configurableModels,
    id,
  });

  const targetConfig = useMemo(() => {
    const id = getItemId(model, item);
    return _.findWhere(configs, { model, model_id: id });
  }, [configs, model, item]);
  const savedStrategy = targetConfig?.strategy;

  const shortStrategyLabel =
    getShortStrategyLabel(savedStrategy, model) || t`Use default`;

  return (
    <DelayedLoadingAndErrorWrapper delay={0} loading={loading} error={error}>
      <Flex align="center" justify="space-between">
        {t`Caching policy`}
        <FormLauncher role="button" onClick={() => setPage("caching")}>
          {shortStrategyLabel}
        </FormLauncher>
      </Flex>
    </DelayedLoadingAndErrorWrapper>
  );
};
