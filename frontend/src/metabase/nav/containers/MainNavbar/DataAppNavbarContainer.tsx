import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";

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

type NavbarModal = "MODAL_APP_SETTINGS" | null;

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
    return null;
  }, [dataApp, modal, closeModal]);

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
