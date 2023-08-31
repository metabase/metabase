import { t } from "ttag";
import type { IconName } from "metabase/core/components/Icon";
import type { EnabledSearchModelType } from "metabase/search/types";

export const SearchFilterKeys = {
  Type: "type",
} as const;

export const SEARCH_FILTERS: {
  name: string;
  icon: IconName;
  filter: EnabledSearchModelType;
}[] = [
  {
    name: t`Collections`,
    filter: "collection",
    icon: "folder",
  },
  {
    name: t`Dashboards`,
    filter: "dashboard",
    icon: "dashboard",
  },
  {
    name: t`Questions`,
    filter: "card",
    icon: "bar",
  },
  {
    name: t`Databases`,
    filter: "database",
    icon: "database",
  },
  {
    name: t`Tables`,
    filter: "table",
    icon: "table",
  },
  {
    name: t`Models`,
    filter: "dataset",
    icon: "model",
  },
  {
    name: t`Actions`,
    filter: "action",
    icon: "bolt",
  },
];

export const enabledSearchTypes = SEARCH_FILTERS.map(({ filter }) => filter);
