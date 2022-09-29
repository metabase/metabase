import React from "react";

import * as Urls from "metabase/lib/urls";

import type { DataApp, Dashboard } from "metabase-types/api";

import { DataAppPageLink } from "./DataAppPageSidebarLink.styled";

interface Props {
  dataApp: DataApp;
  page: Dashboard;
  isSelected: boolean;
  indent?: number;
}

function DataAppPageSidebarLink({
  dataApp,
  page,
  isSelected,
  indent = 0,
}: Props) {
  return (
    <DataAppPageLink
      key={page.id}
      url={Urls.dataAppPage(dataApp, page)}
      isSelected={isSelected}
      indent={indent}
    >
      {page.name}
    </DataAppPageLink>
  );
}

export default DataAppPageSidebarLink;
