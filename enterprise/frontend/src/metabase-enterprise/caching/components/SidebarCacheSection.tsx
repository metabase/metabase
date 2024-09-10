import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { SidebarCacheSectionProps } from "metabase/plugins";
import { Button, Flex, Icon, Loader } from "metabase/ui";

import Styles from "./SidebarCacheSection.module.css";
import { getItemId } from "./utils";

/** Displays the current cache invalidation strategy and provides a button that
 * opens the cache configuration form */
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
  const labelId = "question-caching-policy-label";

  return (
    <SidesheetCard title={<span id={labelId}>{t`Caching`}</span>} pb="md">
      <Flex align="center" justify="space-between" mih={34}>
        {t`When to get new results`}
        <DelayedLoadingAndErrorWrapper
          loading={loading}
          error={error}
          loader={<Loader h={24} size="md" />}
        >
          <Button
            variant="subtle"
            className={Styles.FormLauncher}
            onClick={() => setPage("caching")}
            aria-labelledby={labelId}
            py="sm"
            px={0}
            fw="bold"
          >
            <Flex align="center" gap="xs">
              {shortStrategyLabel}
              <Icon
                className={Styles.FormLauncherIcon}
                color="var(--mb-color-text-dark)"
                name="chevronright"
              />
            </Flex>
          </Button>
        </DelayedLoadingAndErrorWrapper>
      </Flex>
    </SidesheetCard>
  );
};
