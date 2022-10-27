import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import type { LocationDescriptor } from "history";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";

import DataApps, {
  getPreviousNavItem,
  isTopLevelNavItem,
} from "metabase/entities/data-apps";
import Search from "metabase/entities/search";

import { setEditingDashboard as setEditingDataAppPage } from "metabase/dashboard/actions";

import ArchiveDataAppModal from "metabase/writeback/containers/ArchiveDataAppModal";
import ArchiveDataAppPageModal from "metabase/writeback/containers/ArchiveDataAppPageModal";
import CreateDataAppPageModalForm from "metabase/writeback/containers/CreateDataAppPageModalForm";
import ScaffoldDataAppPagesModal from "metabase/writeback/containers/ScaffoldDataAppPagesModal";

import type { DataApp, DataAppPage } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  MainNavbarProps,
  MainNavbarOwnProps,
  SelectedItem,
} from "../types";
import NavbarLoadingView from "../NavbarLoadingView";

import type { DataAppNavbarMode } from "./types";

import getSelectedItems from "./getSelectedItems";
import DataAppNavbarView from "./DataAppNavbarView";

const FETCHING_SEARCH_MODELS = ["page"];
const LIMIT = 100;

type NavbarModal =
  | "MODAL_ADD_DATA"
  | "MODAL_APP_SETTINGS"
  | "MODAL_NEW_PAGE"
  | "MODAL_ARCHIVE_PAGE"
  | "MODAL_ARCHIVE_APP"
  | null;

interface DataAppNavbarContainerOwnProps extends MainNavbarProps {
  dataApp: DataApp;
  pages: any[];
}

interface DataAppNavbarContainerDispatchProps {
  setEditingDataAppPage: (isEditing: boolean) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

type DataAppNavbarContainerProps = DataAppNavbarContainerOwnProps &
  DataAppNavbarContainerDispatchProps & {
    onReloadNavbar: () => Promise<void>;
  };

type DataAppNavbarContainerLoaderProps = DataAppNavbarContainerOwnProps &
  DataAppNavbarContainerDispatchProps & {
    dataApp?: DataApp;
  };

type SearchRenderProps = {
  list: any[];
  loading: boolean;
  reload: () => Promise<void>;
};

const mapDispatchToProps = {
  setEditingDataAppPage,
  onChangeLocation: push,
};

function DataAppNavbarContainer({
  dataApp,
  pages: fetchedPages,
  location,
  params,
  onReloadNavbar,
  setEditingDataAppPage,
  onChangeLocation,
  ...props
}: DataAppNavbarContainerProps) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const mode: DataAppNavbarMode = Urls.isDataAppPreviewPath(location.pathname)
    ? "manage-content"
    : "running";

  const pages = useMemo(
    () => fetchedPages.filter(page => !page.archived),
    [fetchedPages],
  );

  const selectedItems: SelectedItem[] = useMemo(
    () => getSelectedItems({ dataApp, pages, location, params }),
    [dataApp, pages, location, params],
  );

  const selectedPageId = useMemo(() => {
    const pageItem = selectedItems.find(item => item.type === "data-app-page");
    return (pageItem?.id as DataAppPage["id"]) || null;
  }, [selectedItems]);

  const handleEnablePageEditing = useCallback(() => {
    setEditingDataAppPage(true);
  }, [setEditingDataAppPage]);

  const handleNewDataAdded = useCallback(
    async (nextDataAppState: DataApp) => {
      // refresh navbar content to show scaffolded pages
      await onReloadNavbar();

      // 1. New pages are added to the end of data app's nav_items list,
      // so 1st non-hidden page from the end is a good candidate to navigate to.
      // 2. Array.prototype.reverse is mutating and it's important not to mess up the real ordering
      const reversedNavItems = [...nextDataAppState.nav_items].reverse();
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

  const onArchiveApp = useCallback(() => {
    setModal("MODAL_ARCHIVE_APP");
  }, []);

  const onArchivePage = useCallback(() => {
    setModal("MODAL_ARCHIVE_PAGE");
  }, []);

  const handleAppArchive = useCallback(() => {
    onChangeLocation("/");
  }, [onChangeLocation]);

  const handlePageArchive = useCallback(
    (pageId: DataAppPage["id"]) => {
      const navItemToOpen =
        getPreviousNavItem(dataApp.nav_items, pageId) ||
        dataApp.nav_items.find(
          navItem => isTopLevelNavItem(navItem) && navItem.page_id !== pageId,
        );

      const nextUrl = navItemToOpen
        ? Urls.dataAppPage(dataApp, navItemToOpen)
        : Urls.dataApp(dataApp);

      onChangeLocation(nextUrl);
    },
    [dataApp, onChangeLocation],
  );

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
        <CreateDataAppPageModalForm
          dataApp={dataApp}
          onClose={closeModal}
          onSave={(page: DataAppPage) => {
            closeModal();
            onChangeLocation(Urls.dataAppPage(dataApp, page));
          }}
        />
      );
    }

    if (!selectedPageId) {
      return null;
    }

    if (modal === "MODAL_ARCHIVE_APP") {
      return (
        <ArchiveDataAppModal
          appId={dataApp.id}
          onArchive={handleAppArchive}
          onClose={closeModal}
        />
      );
    }

    if (modal === "MODAL_ARCHIVE_PAGE") {
      return (
        <ArchiveDataAppPageModal
          appId={dataApp.id}
          pageId={selectedPageId}
          onArchive={() => handlePageArchive(selectedPageId)}
          onClose={closeModal}
        />
      );
    }

    return null;
  }, [
    dataApp,
    selectedPageId,
    modal,
    handleNewDataAdded,
    handleAppArchive,
    handlePageArchive,
    closeModal,
    onChangeLocation,
  ]);

  return (
    <>
      <DataAppNavbarView
        {...props}
        dataApp={dataApp}
        pages={pages}
        selectedItems={selectedItems}
        mode={mode}
        onAddData={onAddData}
        onNewPage={onNewPage}
        onEditAppPage={handleEnablePageEditing}
        onEditAppSettings={onEditAppSettings}
        onArchiveApp={onArchiveApp}
        onArchivePage={onArchivePage}
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

export default _.compose(
  withRouter,
  DataApps.load({ id: getDataAppId }),
  connect(null, mapDispatchToProps),
)(DataAppNavbarContainerLoader);
