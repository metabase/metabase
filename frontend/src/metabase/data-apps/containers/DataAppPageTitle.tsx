import React, { useMemo } from "react";

import { useDataAppContext } from "metabase/data-apps/containers/DataAppContext";

import DataAppPageTitleView, {
  DataAppPageTitleProps as DataAppPageTitleViewProps,
} from "metabase/data-apps/components/DataAppPageTitle";

import type { DataAppPage, DataAppNavItem } from "metabase-types/api";

interface Props
  extends Omit<
    DataAppPageTitleViewProps,
    "titleTemplate" | "compiledTitle" | "suggestions"
  > {
  value?: string;
  page: DataAppPage;
  navItem?: DataAppNavItem;
}

function DataAppPageTitle({
  page,
  navItem,
  value: initialValue,
  ...props
}: Props) {
  const { data, format } = useDataAppContext();

  const value = initialValue ?? navItem?.title_template ?? page.name;

  const suggestions = useMemo(() => {
    const entries = Object.entries(data);
    return Object.fromEntries(
      entries.map(entry => {
        const [cardName, columnsNameValueMap] = entry;
        const columnNames = Object.keys(columnsNameValueMap);
        return [cardName, columnNames];
      }),
    );
  }, [data]);

  return (
    <DataAppPageTitleView
      titleTemplate={value}
      compiledTitle={format(value)}
      isDisabled={!page.can_write}
      suggestions={suggestions}
      {...props}
    />
  );
}

export default DataAppPageTitle;
