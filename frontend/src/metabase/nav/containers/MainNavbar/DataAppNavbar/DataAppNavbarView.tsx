import React, { useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import _ from "underscore";

import type { DataApp, DataAppPage, DataAppNavItem } from "metabase-types/api";

import { MainNavbarProps, SelectedItem } from "../types";
import {
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
} from "../MainNavbar.styled";
import DataAppActionPanel from "./DataAppActionPanel";

import DataAppPageSidebarLink from "./DataAppPageSidebarLink";

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  onNavItemsOrderChange: (
    oldIndex: number,
    newIndex: number,
    navItem: DataAppNavItem,
  ) => void;
  onEditAppSettings: () => void;
  onAddData: () => void;
  onNewPage: () => void;
}

function DataAppNavbarView({
  dataApp,
  pages,
  selectedItems,
  onNavItemsOrderChange,
  onEditAppSettings,
  onAddData,
  onNewPage,
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

  const handleNavItemsOrderChange = useCallback(
    ({ source, destination, draggableId: pageId }) => {
      // Pages created via "Add page" flow might not be present in nav items
      // We show them at the end of the page list by default,
      // and would generate a new nav item for them.
      const navItem = dataApp.nav_items[source.index] || {
        page_id: Number(pageId),
      };

      onNavItemsOrderChange(source.index, destination.index, navItem);
    },
    [dataApp, onNavItemsOrderChange],
  );

  const renderPage = useCallback(
    (page: DataAppPage, index: number, indent = 0) => (
      <Draggable key={page.id} draggableId={String(page.id)} index={index}>
        {(provided, snapshot) => (
          <DataAppPageSidebarLink
            {...provided.draggableProps}
            dataApp={dataApp}
            page={page}
            isDragging={snapshot.isDragging}
            isSelected={dataAppPage?.id === page.id}
            indent={indent}
            dragHandleProps={provided.dragHandleProps}
            ref={provided.innerRef}
          />
        )}
      </Draggable>
    ),
    [dataApp, dataAppPage],
  );

  const renderNavItem = useCallback(
    (navItem: DataAppNavItem, index: number) => {
      const page = pageMap[navItem.page_id];

      if (!page || navItem.hidden) {
        return null;
      }

      return renderPage(page, index, navItem.indent);
    },
    [pageMap, renderPage],
  );

  const renderPageWithoutNavItem = useCallback(
    (page: DataAppPage, index: number) => {
      // Pages created via "Add page" flow might not be present in nav items
      // We also need to know their overall index in the list for reordering items
      // so we're treating them as if they were at the end of nav items
      const finalIndex = dataApp.nav_items.length + index;
      return renderPage(page, finalIndex);
    },
    [dataApp.nav_items, renderPage],
  );

  return (
    <SidebarContentRoot>
      <SidebarSection>
        <SidebarHeadingWrapper>
          <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
        </SidebarHeadingWrapper>
        <DragDropContext onDragEnd={handleNavItemsOrderChange}>
          <Droppable droppableId="droppable" type="droppableItem">
            {provided => (
              <ul ref={provided.innerRef}>
                {dataApp.nav_items.map(renderNavItem)}
                {pagesWithoutNavItems.map(renderPageWithoutNavItem)}
              </ul>
            )}
          </Droppable>
        </DragDropContext>
      </SidebarSection>
      <DataAppActionPanel
        dataApp={dataApp}
        onAddData={onAddData}
        onNewPage={onNewPage}
        onEditAppSettings={onEditAppSettings}
      />
    </SidebarContentRoot>
  );
}

export default DataAppNavbarView;
