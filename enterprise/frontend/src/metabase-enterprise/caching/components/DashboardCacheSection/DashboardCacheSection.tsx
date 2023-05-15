import React from "react";
import { Dashboard } from "metabase-types/api";
import CacheSection from "../CacheSection";

interface DashboardCacheSectionProps {
  dashboard: Dashboard;
  onSave: (cache_ttl: number | null) => Promise<Dashboard>;
}

const DashboardCacheSection = ({
  dashboard,
  onSave,
}: DashboardCacheSectionProps) => {
  return <CacheSection initialCacheTTL={dashboard.cache_ttl} onSave={onSave} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DashboardCacheSection;
