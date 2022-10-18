import React from "react";

import * as Urls from "metabase/lib/urls";

import type { DataApp, DataAppPage } from "metabase-types/api";

import { StyledLink } from "./DataAppPageLink.styled";

interface DataAppPageLinkProps {
  dataApp: DataApp;
  page: DataAppPage;
  isSelected: boolean;
}

function DataAppPageLink({ dataApp, page, isSelected }: DataAppPageLinkProps) {
  const path = Urls.dataAppPage(dataApp, page);
  return (
    <StyledLink to={path} isSelected={isSelected}>
      {page.name}
    </StyledLink>
  );
}

export default DataAppPageLink;
