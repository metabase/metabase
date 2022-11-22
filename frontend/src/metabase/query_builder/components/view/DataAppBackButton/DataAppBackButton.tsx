import React from "react";

import Icon from "metabase/components/Icon";

import DataApps from "metabase/entities/data-apps";
import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import { DataAppLink } from "./DataAppBackButton.styled";

function DataAppBackButton({ url }: { url: string }) {
  const dataAppId = Urls.getDataAppIdFromPath(url);
  return (
    <DataApps.Loader id={dataAppId} loadingAndErrorWrapper={false}>
      {({ dataApp }: { dataApp?: DataApp }) => {
        if (!dataApp) {
          return null;
        }
        return (
          <DataAppLink to={url}>
            <Icon name="chevronleft" />
            {dataApp.collection.name}
          </DataAppLink>
        );
      }}
    </DataApps.Loader>
  );
}

export default DataAppBackButton;
