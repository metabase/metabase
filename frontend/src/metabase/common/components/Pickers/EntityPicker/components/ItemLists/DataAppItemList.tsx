import { useMemo } from "react";

import { PLUGIN_DATA_APPS } from "metabase/plugins";

import { getDataAppItem } from "../../hooks/utils";

import { ItemList } from "./ItemList";

export function DataAppItemList({ pathIndex }: { pathIndex: number }) {
  const {
    data: dataApps,
    isLoading,
    error,
  } = PLUGIN_DATA_APPS.useDataApps({ skip: false });

  const items = useMemo(() => dataApps?.map(getDataAppItem), [dataApps]);

  return (
    <ItemList
      items={items}
      isLoading={isLoading}
      error={error}
      pathIndex={pathIndex}
    />
  );
}
