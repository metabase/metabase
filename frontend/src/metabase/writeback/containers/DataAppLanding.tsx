import React, { ReactNode } from "react";

import { extractCollectionId } from "metabase/lib/urls";

import DataApps from "metabase/entities/data-apps";

import CollectionContent from "metabase/collections/containers/CollectionContent";

import { DataApp } from "metabase-types/api";
import { State } from "metabase-types/store";

interface DataAppLandingOwnProps {
  params: {
    slug: string;
  };
  children?: ReactNode;
}

interface DataAppLandingProps extends DataAppLandingOwnProps {
  dataApp: DataApp;
}

const DataAppLanding = ({ dataApp, children }: DataAppLandingProps) => {
  return (
    <>
      <CollectionContent collectionId={dataApp.collection_id} isRoot={false} />
      {children}
    </>
  );
};

export default DataApps.load({
  id: (state: State, { params }: DataAppLandingOwnProps) =>
    extractCollectionId(params.slug),
})(DataAppLanding);
