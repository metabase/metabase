import { t } from "ttag";
import { IconName } from "metabase/core/components/Icon";
import { SearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
} as const;

export const SEARCH_FILTERS: {
  name: string;
  icon: IconName;
  filter: SearchModelType;
}[] = [
  {
    name: t`Dashboards`,
    filter: "dashboard",
    icon: "dashboard",
  },
  {
    name: t`Collections`,
    filter: "collection",
    icon: "folder",
  },
  {
    name: t`Databases`,
    filter: "database",
    icon: "database",
  },
  {
    name: t`Models`,
    filter: "dataset",
    icon: "model",
  },
  {
    name: t`Raw Tables`,
    filter: "table",
    icon: "table",
  },
  {
    name: t`Questions`,
    filter: "card",
    icon: "bar",
  },
  {
    name: t`Pulses`,
    filter: "pulse",
    icon: "pulse",
  },
  {
    name: t`Metrics`,
    filter: "metric",
    icon: "sum",
  },
  {
    name: t`Segments`,
    filter: "segment",
    icon: "segment",
  },
];

export const enabledSearchTypes = SEARCH_FILTERS.map(({ filter }) => filter);
