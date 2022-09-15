import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { LocationDescriptor } from "history";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";

import DataApps, { getDataAppHomePageId } from "metabase/entities/data-apps";
import Dashboards from "metabase/entities/dashboards";
import Search from "metabase/entities/search";

import ScaffoldDataAppPagesModal from "metabase/writeback/containers/ScaffoldDataAppPagesModal";

import type { DataApp, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { MainNavbarProps, MainNavbarOwnProps, SelectedItem } from "../types";
import NavbarLoadingView from "../NavbarLoadingView";

import DataAppNavbarView from "./DataAppNavbarView";

const FETCHING_SEARCH_MODELS = ["page"];
const LIMIT = 100;

function isAtDataAppHomePage(selectedItems: SelectedItem[]) {
  const [selectedItem] = selectedItems;
  return selectedItems.length === 1 && selectedItem.type === "data-app";
}

type NavbarModal =
  | "MODAL_ADD_DATA"
  | "MODAL_APP_SETTINGS"
  | "MODAL_NEW_PAGE"
  | null;

interface DataAppNavbarContainerProps extends MainNavbarProps {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  onChangeLocation: (location: LocationDescriptor) => void;
}

type DataAppNavbarContainerLoaderProps = DataAppNavbarContainerProps & {
  dataApp?: DataApp;
};

type SearchRenderProps = {
  list: any[];
  loading: boolean;
  reload: () => Promise<void>;
};

function DataAppNavbarContainer({
  dataApp,
  pages,
  selectedItems,
  onReloadNavbar,
  onChangeLocation,
  ...props
}: DataAppNavbarContainerProps & { onReloadNavbar: () => Promise<void> }) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const finalSelectedItems: SelectedItem[] = useMemo(() => {
    const isHomepage = isAtDataAppHomePage(selectedItems);

    // Once a data app is launched, the first view is going to be the app homepage
    // Homepage is an app page specified by a user or picked automatically (just the first one)
    // The homepage doesn't have a regular page path like /a/1/page/1, but an app one like /a/1
    // So we need to overwrite the selectedItems list here and specify the homepage
    if (isHomepage) {
      return [
        {
          type: "data-app-page",
          id: getDataAppHomePageId(dataApp, pages),
        },
      ];
    }

    return selectedItems;
  }, [dataApp, pages, selectedItems]);

  const handleNewDataAdded = useCallback(
    async (nextDataAppState: DataApp) => {
      // refresh navbar content to show scaffolded pages
      await onReloadNavbar();

      // New pages are added to the end of data app's nav_items list,
      // so 1st non-hidden page from the end is a good candidate to navigate to
      const reversedNavItems = nextDataAppState.nav_items.reverse();
      const newPageNavItem = reversedNavItems.find(
        navItem => typeof navItem.page_id === "number" && !navItem.hidden,
      );

      if (newPageNavItem) {
        onChangeLocation(Urls.dataAppPage(nextDataAppState, newPageNavItem));
      }
    },
    [onReloadNavbar, onChangeLocation],
  );

  const onAddData = useCallback(() => {
    setModal("MODAL_ADD_DATA");
  }, []);

  const onEditAppSettings = useCallback(() => {
    setModal("MODAL_APP_SETTINGS");
  }, []);

  const onNewPage = useCallback(() => {
    setModal("MODAL_NEW_PAGE");
  }, []);
  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === "MODAL_ADD_DATA") {
      return (
        <ScaffoldDataAppPagesModal
          dataAppId={dataApp.id}
          onAdd={handleNewDataAdded}
          onClose={closeModal}
        />
      );
    }
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
  }, [dataApp, modal, handleNewDataAdded, closeModal, onChangeLocation]);

  return (
    <>
      <DataAppNavbarView
        {...props}
        dataApp={dataApp}
        pages={pages}
        selectedItems={finalSelectedItems}
        onAddData={onAddData}
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
      keepListWhileLoading
      loadingAndErrorWrapper={false}
    >
      {({
        list = [],
        loading: loadingAppContent,
        reload,
      }: SearchRenderProps) => {
        // It's possible to appear in loading state with some data available
        // This happens when we need to refresh navbar content
        // This makes it show the previous state while loading to avoid flickering
        if (loadingAppContent && list.length === 0) {
          return <NavbarLoadingView />;
        }
        return (
          <DataAppNavbarContainer
            {...props}
            dataApp={dataApp}
            pages={list}
            onReloadNavbar={reload}
          />
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
