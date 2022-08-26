import React, { useMemo } from "react";

import * as Urls from "metabase/lib/urls";

import DataApps from "metabase/entities/data-apps";
import Search from "metabase/entities/search";

import type { DataApp } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { MainNavbarProps, MainNavbarOwnProps, SelectedItem } from "./types";
import NavbarLoadingView from "./NavbarLoadingView";
import DataAppNavbarView from "./DataAppNavbarView";

const FETCHING_SEARCH_MODELS = ["dashboard", "dataset", "card"];
const LIMIT = 100;

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  loading: boolean;
  selectedItems: SelectedItem[];
}

type SearchRenderProps = {
  list: any[];
  loading: boolean;
};

function DataAppNavbarContainer({
  dataApp,
  loading: loadingDataApp,
  ...props
}: Props) {
  const collectionContentQuery = useMemo(() => {
    if (!dataApp) {
      return {};
    }
    return {
      collection: dataApp.collection_id,
      models: FETCHING_SEARCH_MODELS,
      limit: LIMIT,
    };
  }, [dataApp]);

  if (loadingDataApp) {
    return <NavbarLoadingView />;
  }

  return (
    <Search.ListLoader
      query={collectionContentQuery}
      loadingAndErrorWrapper={false}
    >
      {({ list = [], loading: loadingAppContent }: SearchRenderProps) => {
        if (loadingAppContent) {
          return <NavbarLoadingView />;
        }
        return <DataAppNavbarView {...props} dataApp={dataApp} items={list} />;
      }}
    </Search.ListLoader>
  );
}

function getDataAppId(state: State, props: MainNavbarOwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

export default DataApps.load({ id: getDataAppId })(DataAppNavbarContainer);
