import React from "react";
import { withRouter } from "react-router";
import type { Location } from "history";

import Icon from "metabase/components/Icon";

import DataApps from "metabase/entities/data-apps";
import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import { DataAppLink } from "./DataAppBackButton.styled";

function DataAppBackButton({ location }: { location: Location }) {
  const fromUrl = location.query.from;

  if (typeof fromUrl !== "string") {
    return null;
  }

  return (
    <DataApps.Loader
      id={Urls.getDataAppIdFromPath(fromUrl)}
      loadingAndErrorWrapper={false}
    >
      {({ dataApp }: { dataApp?: DataApp }) => {
        if (!dataApp) {
          return null;
        }
        return (
          <DataAppLink to={fromUrl}>
            <Icon name="chevronleft" />
            {dataApp.collection.name}
          </DataAppLink>
        );
      }}
    </DataApps.Loader>
  );
}

export default withRouter(DataAppBackButton);
