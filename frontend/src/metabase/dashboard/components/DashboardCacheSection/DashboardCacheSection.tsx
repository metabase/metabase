import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/strategies";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Button, Flex } from "metabase/ui";
import type { CacheableDashboard, CacheableModel } from "metabase-types/api";

const configurableModels: CacheableModel[] = ["dashboard"];

type DashboardCacheSectionProps = {
  dashboard: CacheableDashboard;
  setPage: Dispatch<SetStateAction<"default" | "caching">>;
};

export const DashboardCacheSection = ({
  dashboard,
  setPage,
}: DashboardCacheSectionProps) => {
  const { configs, loading, error } = useCacheConfigs({
    configurableModels,
    id: dashboard.id,
  });

  const targetConfig = useMemo(
    () => _.findWhere(configs, { model_id: dashboard.id }),
    [configs, dashboard.id],
  );
  const savedStrategy = targetConfig?.strategy;

  const shortStrategyLabel =
    getShortStrategyLabel(savedStrategy, "dashboard") || t`Use default`;

  return (
    <DelayedLoadingAndErrorWrapper loading={loading} error={error}>
      <Flex align="center" justify="space-between">
        {t`Caching policy`}
        <Button
          onClick={() => setPage("caching")}
          variant="subtle"
          radius={0}
          p={0}
          style={{ border: "none" }}
        >
          {shortStrategyLabel}
        </Button>
      </Flex>
    </DelayedLoadingAndErrorWrapper>
  );
};
