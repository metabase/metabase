import type { DashboardCacheSectionProps } from "metabase/plugins";

import CacheSection from "../CacheSection";

const DashboardCacheSection = ({
  dashboard,
  onSave,
}: DashboardCacheSectionProps) => {
  return <CacheSection initialCacheTTL={dashboard.cache_ttl} onSave={onSave} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardCacheSection;
