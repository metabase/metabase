import { t } from "ttag";

import type { ColumnItem } from "metabase/common/components/Table/types";

/** Retrieve constants for the dashboard and question caching table
 *
 * Some constants need to be defined within the component's scope so that ttag.t knows the current locale */
export const getConstants = () => {
  const tableColumns: ColumnItem[] = [
    { key: "name", name: t`Name`, sortable: true },
    { key: "collection", name: t`Collection`, sortable: true },
    { key: "policy", name: t`Policy`, sortable: true },
  ];
  return { tableColumns };
};
