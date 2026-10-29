import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";
import _ from "underscore";

import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { PLUGIN_CACHING } from "metabase/plugins";
import { UnstyledButton } from "metabase/ui";
import type { CacheableDashboard, CacheableModel } from "metabase-types/api";

import { DashboardStat } from "./DashboardStat";

const CACHE_CONFIG_MODELS: CacheableModel[] = ["dashboard"];

type CachePolicyStatProps = {
  dashboard: CacheableDashboard;
};

/** The dashboard's caching policy, which opens the caching form unless the dashboard is in the trash */
export function CachePolicyStat({ dashboard }: CachePolicyStatProps) {
  const labelId = useUniqueId();
  const [isFormOpen, { open: openForm, close: closeForm }] =
    useDisclosure(false);
  const { configs, isLoading, error } = useCacheConfigs({
    model: CACHE_CONFIG_MODELS,
    id: dashboard.id,
  });

  if (isLoading) {
    return null;
  }

  if (error != null) {
    return (
      <DashboardStat label={t`Caching policy`} value={t`Failed to load`} />
    );
  }

  const config = _.findWhere(configs ?? [], {
    model: "dashboard",
    model_id: dashboard.id,
  });
  const strategyLabel =
    getShortStrategyLabel(config?.strategy, "dashboard") ?? t`Default`;

  if (dashboard.archived) {
    return <DashboardStat label={t`Caching policy`} value={strategyLabel} />;
  }

  return (
    <>
      <DashboardStat
        label={t`Caching policy`}
        labelId={labelId}
        value={
          <UnstyledButton
            c="core-brand"
            fw={600}
            aria-labelledby={labelId}
            onClick={openForm}
          >
            {strategyLabel}
          </UnstyledButton>
        }
      />
      {/* Mounted only while open: the form's route-leave guard keeps its
          dirty state, which would block every later navigation once closed */}
      {isFormOpen && (
        <PLUGIN_CACHING.SidebarCacheForm
          item={dashboard}
          model="dashboard"
          isOpen
          // Opened on its own, so there is no settings page to go back to
          withBackButton={false}
          onClose={closeForm}
          onBack={closeForm}
        />
      )}
    </>
  );
}
