import React, { ReactNode } from "react";
import { Location } from "history";

import * as Urls from "metabase/lib/urls";

import DataApps, { getDataAppHomePageId } from "metabase/entities/data-apps";
import Search from "metabase/entities/search";

import CollectionContent from "metabase/collections/containers/CollectionContent";
import DashboardApp from "metabase/dashboard/containers/DashboardApp";

import { DataApp } from "metabase-types/api";
import { State } from "metabase-types/store";

interface DataAppLandingOwnProps {
  location: Location;
  params: {
    slug: string;
  };
  children?: ReactNode;
}

interface DataAppLandingProps extends DataAppLandingOwnProps {
  dataApp: DataApp;
}

const DataAppLanding = ({
  dataApp,
  location,
  params,
  children,
}: DataAppLandingProps) => {
  if (Urls.isDataAppPreviewPath(location.pathname)) {
    return (
      <CollectionContent collectionId={dataApp.collection_id} isRoot={false} />
    );
  }

  return (
    <>
      <Search.ListLoader
        query={{
          collection: dataApp.collection_id,
          models: ["page"],
          limit: 100,
        }}
        loadingAndErrorWrapper={false}
      >
        {({ list: pages = [] }: { list: any[] }) => {
          const homepageId = getDataAppHomePageId(dataApp, pages);
          return homepageId ? (
            <DashboardApp
              dashboardId={homepageId}
              location={location}
              params={params}
            />
          ) : null;
        }}
      </Search.ListLoader>
      {children}
    </>
  );
};

export default DataApps.load({
  id: (state: State, { params }: DataAppLandingOwnProps) =>
    Urls.extractCollectionId(params.slug),
})(DataAppLanding);
