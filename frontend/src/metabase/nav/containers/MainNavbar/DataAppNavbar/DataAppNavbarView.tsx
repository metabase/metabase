import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import type { LocationDescriptor } from "history";

import type { DataApp } from "metabase-types/api";

import Link from "metabase/core/components/Link";
import Radio from "metabase/core/components/Radio";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import { MainNavbarProps, SelectedItem } from "../types";
import DataAppActionPanel from "./DataAppActionPanel";

interface Props extends Omit<MainNavbarProps, "location" | "params"> {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  onEditAppSettings: () => void;
  onAddData: () => void;
  onNewPage: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

function DataAppNavbarView({
  dataApp,
  pages,
  selectedItems,
  onEditAppSettings,
  onAddData,
  onNewPage,
  onChangeLocation,
}: Props) {
  const { "data-app-page": dataAppPage } = _.indexBy(
    selectedItems,
    item => item.type,
  );

  const pageMap = useMemo(() => _.indexBy(pages, "id"), [pages]);

  const pagesWithoutNavItems = useMemo(() => {
    const pageIds = pages.map(page => page.id);
    const navItemPageIds = dataApp.nav_items
      .filter(navItem => navItem.page_id)
      .map(navItem => navItem.page_id);
    const pagesWithoutNavItems = _.difference(pageIds, navItemPageIds);
    return pagesWithoutNavItems.map(pageId => pageMap[pageId]);
  }, [dataApp.nav_items, pages, pageMap]);

  const navOptions = useMemo(() => {
    const options = dataApp.nav_items
      .filter(navItem => !navItem.hidden && pageMap[navItem.page_id])
      .map(navItem => {
        const page = pageMap[navItem.page_id];
        return {
          name: page.name,
          value: page.id,
        };
      });

    options.push(
      ...pagesWithoutNavItems.map(page => ({
        name: page.name,
        value: page.id,
      })),
    );

    return options;
  }, [dataApp, pagesWithoutNavItems, pageMap]);

  const onNavItemClick = useCallback(
    pageId => {
      const page = pageMap[Number(pageId)];
      const path = Urls.dataAppPage(dataApp, page);
      console.log({ pageId, onChangeLocation, dataApp, page, path });
      onChangeLocation(path);
    },
    [dataApp, pageMap, onChangeLocation],
  );

  const exitAppPath = Urls.dataApp(dataApp, { mode: "preview" });

  return (
    <div className="flex align-center">
      <Radio
        value={dataAppPage?.id}
        options={navOptions}
        onOptionClick={onNavItemClick}
        variant="underlined"
      />
      <div className="flex align-center ml-auto">
        <DataAppActionPanel
          dataApp={dataApp}
          onAddData={onAddData}
          onNewPage={onNewPage}
          onEditAppSettings={onEditAppSettings}
        />
        <Tooltip tooltip={t`App elements`}>
          <Link to={exitAppPath} className="ml2">
            <Icon name="list" />
          </Link>
        </Tooltip>
      </div>
    </div>
  );
}

export default DataAppNavbarView;
