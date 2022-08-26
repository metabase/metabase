import React, { useCallback, useMemo, useState } from "react";
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

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  loading: boolean;
  selectedItems: SelectedItem[];
  onChangeLocation: (location: LocationDescriptor) => void;
}

type SearchRenderProps = {
  list: any[];
  loading: boolean;
};

function DataAppNavbarContainer({
  dataApp,
  loading: loadingDataApp,
  onChangeLocation,
  ...props
}: Props) {
  const [modal, setModal] = useState<NavbarModal>(null);

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

  if (loadingDataApp) {
    return <NavbarLoadingView />;
  }

  return (
    <>
      <Search.ListLoader
        query={collectionContentQuery}
        loadingAndErrorWrapper={false}
      >
        {({ list = [], loading: loadingAppContent }: SearchRenderProps) => {
          if (loadingAppContent) {
            return <NavbarLoadingView />;
          }
          return (
            <DataAppNavbarView
              {...props}
              dataApp={dataApp}
              items={list}
              onEditAppSettings={onEditAppSettings}
              onNewPage={onNewPage}
            />
          );
        }}
      </Search.ListLoader>
      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
  );
}

function getDataAppId(state: State, props: MainNavbarOwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

export default DataApps.load({ id: getDataAppId })(DataAppNavbarContainer);
