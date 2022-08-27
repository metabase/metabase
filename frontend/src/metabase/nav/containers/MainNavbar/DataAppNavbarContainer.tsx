import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { LocationDescriptor } from "history";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";

import DataApps from "metabase/entities/data-apps";
import Dashboards from "metabase/entities/dashboards";
import Search from "metabase/entities/search";

import type { DataApp, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { MainNavbarProps, MainNavbarOwnProps, SelectedItem } from "./types";
import NavbarLoadingView from "./NavbarLoadingView";
import DataAppNavbarView from "./DataAppNavbarView";

const FETCHING_SEARCH_MODELS = ["dashboard", "dataset", "card"];
const LIMIT = 100;

type NavbarModal = "MODAL_APP_SETTINGS" | "MODAL_NEW_PAGE" | null;

interface DataAppNavbarContainerProps extends MainNavbarProps {
  dataApp: DataApp;
  items: any[];
  selectedItems: SelectedItem[];
  onChangeLocation: (location: LocationDescriptor) => void;
}

type DataAppNavbarContainerLoaderProps = DataAppNavbarContainerProps & {
  dataApp?: DataApp;
};

type SearchRenderProps = {
  list: any[];
  loading: boolean;
};

function DataAppNavbarContainer({
  dataApp,
  items,
  onChangeLocation,
  ...props
}: DataAppNavbarContainerProps) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const onEditAppSettings = useCallback(() => {
    setModal("MODAL_APP_SETTINGS");
  }, []);

  const onNewPage = useCallback(() => {
    setModal("MODAL_NEW_PAGE");
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === "MODAL_APP_SETTINGS") {
      return (
        <DataApps.ModalForm
          form={DataApps.forms.settings}
          title={t`Settings`}
          dataApp={dataApp}
          onClose={closeModal}
          onSaved={closeModal}
          submitTitle={t`Save`}
        />
      );
    }
    if (modal === "MODAL_NEW_PAGE") {
      return (
        <Dashboards.ModalForm
          form={Dashboards.forms.dataAppPage}
          title={t`New page`}
          dashboard={{
            collection_id: dataApp.collection_id,
          }}
          onClose={closeModal}
          onSaved={(page: Dashboard) => {
            closeModal();
            onChangeLocation(Urls.dataAppPage(dataApp, page));
          }}
        />
      );
    }
    return null;
  }, [dataApp, modal, closeModal, onChangeLocation]);

  return (
    <>
      <DataAppNavbarView
        {...props}
        dataApp={dataApp}
        items={items}
        onNewPage={onNewPage}
        onEditAppSettings={onEditAppSettings}
      />
      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
  );
}

function DataAppNavbarContainerLoader({
  dataApp,
  ...props
}: DataAppNavbarContainerLoaderProps) {
  if (!dataApp) {
    return <NavbarLoadingView />;
  }

  return (
    <Search.ListLoader
      query={{
        collection: dataApp.collection_id,
        models: FETCHING_SEARCH_MODELS,
        limit: LIMIT,
      }}
      loadingAndErrorWrapper={false}
    >
      {({ list = [], loading: loadingAppContent }: SearchRenderProps) => {
        if (loadingAppContent) {
          return <NavbarLoadingView />;
        }
        return (
          <DataAppNavbarContainer {...props} dataApp={dataApp} items={list} />
        );
      }}
    </Search.ListLoader>
  );
}

function getDataAppId(state: State, props: MainNavbarOwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

export default DataApps.load({ id: getDataAppId })(
  DataAppNavbarContainerLoader,
);
