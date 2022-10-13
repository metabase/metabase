import React, { useMemo } from "react";

import { useDataAppContext } from "metabase/writeback/containers/DataAppContext";

import DataAppPageTitleView, {
  DataAppPageTitleProps as DataAppPageTitleViewProps,
} from "metabase/writeback/components/DataAppPageTitle";

import type { DataAppPage } from "metabase-types/api";

interface Props
  extends Omit<
    DataAppPageTitleViewProps,
    "titleTemplate" | "compiledTitle" | "suggestions"
  > {
  page: DataAppPage;
}

function DataAppPageTitle({ page, ...props }: Props) {
  const { data, format } = useDataAppContext();

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
      titleTemplate={page.name}
      compiledTitle={format(page.name)}
      isDisabled={!page.can_write}
      suggestions={suggestions}
      {...props}
    />
  );
}

export default DataAppPageTitle;
