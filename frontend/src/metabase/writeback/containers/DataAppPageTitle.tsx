import React from "react";

import { useDataAppContext } from "metabase/writeback/containers/DataAppContext";

import DataAppPageTitleView, {
  DataAppPageTitleProps as DataAppPageTitleViewProps,
} from "metabase/writeback/components/DataAppPageTitle";

import type { DataAppPage } from "metabase-types/api";

interface Props
  extends Omit<DataAppPageTitleViewProps, "titleTemplate" | "compiledTitle"> {
  page: DataAppPage;
}

function DataAppTitle({ page, ...props }: Props) {
  const { format } = useDataAppContext();

  return (
    <DataAppPageTitleView
      titleTemplate={page.name}
      compiledTitle={format(page.name)}
      isDisabled={!page.can_write}
      {...props}
    />
  );
}

export default DataAppTitle;
