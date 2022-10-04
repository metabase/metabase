import React, { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import type { LocationDescriptor } from "history";
import _ from "underscore";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";

import * as Urls from "metabase/lib/urls";

import DataApps, {
  moveNavItems,
  UpdateDataAppParams,
} from "metabase/entities/data-apps";
import Dashboards from "metabase/entities/dashboards";
import Search from "metabase/entities/search";

import ScaffoldDataAppPagesModal from "metabase/writeback/containers/ScaffoldDataAppPagesModal";

import type { DataApp, DataAppNavItem, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { MainNavbarProps, MainNavbarOwnProps, SelectedItem } from "../types";
import NavbarLoadingView from "../NavbarLoadingView";

import getSelectedItems from "./getSelectedItems";
import DataAppNavbarView from "./DataAppNavbarView";

const FETCHING_SEARCH_MODELS = ["page"];
const LIMIT = 100;

type NavbarModal =
  | "MODAL_ADD_DATA"
  | "MODAL_APP_SETTINGS"
  | "MODAL_NEW_PAGE"
  | null;

interface DataAppNavbarContainerProps extends MainNavbarProps {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  onDataAppChange: (params: UpdateDataAppParams) => void;
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

const mapDispatchToProps = {
  onDataAppChange: DataApps.actions.update,
};

function DataAppNavbarContainer({
  dataApp: dataAppProp,
  pages,
  selectedItems,
  onDataAppChange,
  onReloadNavbar,
  onChangeLocation,
  ...props
}: DataAppNavbarContainerProps & { onReloadNavbar: () => Promise<void> }) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const pageMap = useMemo(() => _.indexBy(pages, "id"), [pages]);

  /**
   * Workaround to solve UI flicker when reordering nav items with DND
   * Ideally we should do an optimistic data app update,
   * so it's updated immediately in Redux and gets reverted if the request fails
   * This isn't straightforward with our entity framework yet
   */
  const [navItems, setNavItems] = useState<DataAppNavItem[]>(
    dataAppProp.nav_items ?? [],
  );

  useEffect(() => {
    setNavItems(dataAppProp.nav_items ?? []);
  }, [dataAppProp.nav_items]);

  const pagesWithoutNavItems = useMemo(() => {
    const pageIds = pages.map(page => page.id);
    const navItemPageIds = navItems
      .filter(navItem => navItem.page_id)
      .map(navItem => navItem.page_id);
    const pagesWithoutNavItems = _.difference(pageIds, navItemPageIds);
    return pagesWithoutNavItems.map(pageId => pageMap[pageId]);
  }, [navItems, pages, pageMap]);

  const dataApp: DataApp = useMemo(() => {
    const virtualNavItems = pagesWithoutNavItems.map(page => ({
      page_id: page.id,
      indent: 0,
    }));
    return {
      ...dataAppProp,
      nav_items: [...navItems, ...virtualNavItems],
    };
  }, [dataAppProp, navItems, pagesWithoutNavItems]);

  const finalSelectedItems: SelectedItem[] = useMemo(
    () => getSelectedItems({ dataApp, pages, selectedItems }),
    [dataApp, pages, selectedItems],
  );

  const getPageForNavItem = useCallback(
    (navItem: DataAppNavItem) => pageMap[navItem.page_id],
    [pageMap],
  );

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

  const handleNavItemsOrderChange = useCallback(
    (oldIndex: number, newIndex: number, navItem: DataAppNavItem) => {
      const nextNavItems = moveNavItems(
        dataApp.nav_items,
        oldIndex,
        newIndex,
        navItem,
      );
      console.log("### NEXT NAV ITEMS", {
        oldIndex,
        newIndex,
        navItem,
        before: dataApp.nav_items.map(i => ({
          title: pageMap[i.page_id]?.name,
          indent: i.indent,
          id: i.page_id,
        })),
        after: nextNavItems.map(i => ({
          title: pageMap[i.page_id]?.name,
          indent: i.indent,
          id: i.page_id,
        })),
      });
      setNavItems(nextNavItems);
      onDataAppChange({
        id: dataApp.id,
        collection_id: dataApp.collection_id,
        nav_items: nextNavItems,
      });
    },
    [dataApp, pageMap, onDataAppChange],
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
        selectedItems={finalSelectedItems}
        getPageForNavItem={getPageForNavItem}
        onNavItemsOrderChange={handleNavItemsOrderChange}
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
  const query = useMemo(() => {
    if (!dataApp) {
      return {};
    }
    return {
      collection: dataApp.collection_id,
      models: FETCHING_SEARCH_MODELS,
      limit: LIMIT,
    };
  }, [dataApp]);

  if (!dataApp) {
    return <NavbarLoadingView />;
  }

  return (
    <Search.ListLoader query={query} loadingAndErrorWrapper={false}>
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
  DataApps.load({ id: getDataAppId }),
  connect(null, mapDispatchToProps),
)(DataAppNavbarContainerLoader);
