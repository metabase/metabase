import React, { useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import type { DraggableChildrenFn } from "react-beautiful-dnd";
import _ from "underscore";

import { groupNavItems, isSameNavItem } from "metabase/entities/data-apps";

import type {
  DataApp,
  DataAppPage,
  DataAppNavItem,
  DataAppNavItemWithChildren,
} from "metabase-types/api";

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
  selectedItems: SelectedItem[];
  getPageForNavItem: (navItem: DataAppNavItem) => DataAppPage | null;
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
  selectedItems,
  getPageForNavItem,
  onNavItemsOrderChange,
  onEditAppSettings,
  onAddData,
  onNewPage,
}: Props) {
  const { "data-app-page": dataAppPage } = _.indexBy(
    selectedItems,
    item => item.type,
  );

  const groupedNavItems = useMemo(
    () => groupNavItems(dataApp.nav_items),
    [dataApp],
  );

  const handleNavItemsOrderChange = useCallback(
    ({ source, destination, draggableId: pageId, type, combine, ...rest }) => {
      console.log("### DROP", {
        source,
        destination,
        draggableId: pageId,
        combine,
        ...rest,
      });

      // Pages created via "Add page" flow might not be present in nav items
      // We show them at the end of the page list by default,
      // and would generate a new nav item for them.
      const navItem = { ...dataApp.nav_items[source.index] } || {
        page_id: Number(pageId),
      };

      if (combine) {
        const parentPageId = Number(combine.draggableId);
        const parentNavItemIndex = dataApp.nav_items.findIndex(
          item => item.page_id === parentPageId,
        );
        const parentNavItem = dataApp.nav_items[parentNavItemIndex];
        const parentIndent = parentNavItem.indent || 0;

        navItem.indent = parentIndent + 1;

        console.log({
          draggedPage: getPageForNavItem(navItem)?.name,
          parentPage: getPageForNavItem(parentNavItem)?.name,
          navItems: dataApp.nav_items.map(item => ({
            title: getPageForNavItem(item)?.name,
            indent: item.indent,
            id: item.page_id,
          })),
          parentNavItemIndex,
          parentNavItem,
          navItem,
        });

        onNavItemsOrderChange(source.index, parentNavItemIndex + 1, navItem);
        return;
      }

      if (destination.index === 0) {
        navItem.indent = 0;
      }

      // console.log("### DROP", {
      //   originalNavItem: { ...dataApp.nav_items[source.index] } || {
      //     page_id: Number(pageId),
      //   },
      //   navItem,
      //   from: source.index,
      //   to: destination.index,
      // });
      onNavItemsOrderChange(source.index, destination.index, navItem);
    },
    [dataApp, getPageForNavItem, onNavItemsOrderChange],
  );

  const renderClone: DraggableChildrenFn = useCallback(
    (provided, snapshot, rubric) => {
      const { index } = rubric.source;
      const navItem = dataApp.nav_items[index];
      const page = getPageForNavItem(navItem);
      if (!page) {
        return <div />;
      }
      return (
        <ul
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          ref={provided.innerRef}
        >
          <DataAppPageSidebarLink
            dataApp={dataApp}
            page={page}
            isDragging
            isSelected={false}
            indent={0}
          />
        </ul>
      );
    },
    [dataApp, getPageForNavItem],
  );

  const renderNavItemGroup = useCallback(
    (group: DataAppNavItemWithChildren) => {
      const { children, ...navItem } = group;
      const page = getPageForNavItem(navItem);
      // console.log({ navItem, page: page?.name });
      if (!page) {
        return null;
      }
      const index = dataApp.nav_items.findIndex(item =>
        isSameNavItem(item, navItem),
      );
      const indent = navItem.indent || 0;

      const droppableId = `${page.id}:${indent}`;

      // console.log(`PAGE ${page.name}`, { index, indent });

      return (
        <Draggable key={page.id} draggableId={String(page.id)} index={index}>
          {(provided, snapshot) => (
            <li {...provided.draggableProps} ref={provided.innerRef}>
              <ul>
                <DataAppPageSidebarLink
                  {...provided.draggableProps}
                  dataApp={dataApp}
                  page={page}
                  isDragging={snapshot.isDragging}
                  isSelected={dataAppPage?.id === page.id}
                  indent={navItem.indent}
                  dragHandleProps={provided.dragHandleProps}
                  ref={provided.innerRef}
                  style={{
                    transitionDuration: "0.001s",
                  }}
                />
                <div
                  style={
                    {
                      // minHeight: "4px",
                      // width: "100%",
                      // backgroundColor:
                      //   !Array.isArray(children) || children?.length === 0
                      //     ? "blue"
                      //     : "transparent",
                    }
                  }
                >
                  {Array.isArray(children) && children.map(renderNavItemGroup)}
                </div>
              </ul>
            </li>
          )}
        </Draggable>
      );

      // return (
      //   <Draggable key={page.id} draggableId={String(page.id)} index={index}>
      //     {(draggableProvided, draggableSnapshot) => (
      //       <li
      //         {...draggableProvided.draggableProps}
      //         ref={draggableProvided.innerRef}
      //       >
      //         <Droppable
      //           droppableId={droppableId}
      //           type="inner"
      //           renderClone={renderClone}
      //         >
      //           {droppableProvided => (
      //             <ul ref={droppableProvided.innerRef}>
      //               <DataAppPageSidebarLink
      //                 {...draggableProvided.draggableProps}
      //                 dataApp={dataApp}
      //                 page={page}
      //                 isDragging={draggableSnapshot.isDragging}
      //                 isSelected={dataAppPage?.id === page.id}
      //                 indent={navItem.indent}
      //                 dragHandleProps={draggableProvided.dragHandleProps}
      //                 ref={draggableProvided.innerRef}
      //               />
      //               <div
      //                 style={{
      //                   minHeight: "4px",
      //                   width: "100%",
      //                   backgroundColor:
      //                     !Array.isArray(children) || children?.length === 0
      //                       ? "blue"
      //                       : "transparent",
      //                 }}
      //               >
      //                 {Array.isArray(children) &&
      //                   children.map(renderNavItemGroup)}
      //               </div>
      //             </ul>
      //           )}
      //         </Droppable>
      //       </li>
      //     )}
      //   </Draggable>
      // );
    },
    [dataApp, dataAppPage, getPageForNavItem, renderClone],
  );

  console.log({
    navItems: dataApp.nav_items.map(i => ({
      page: getPageForNavItem(i)?.name,
      indent: i.indent,
    })),
  });

  return (
    <SidebarContentRoot>
      <SidebarSection>
        <SidebarHeadingWrapper>
          <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
        </SidebarHeadingWrapper>
        <DragDropContext onDragEnd={handleNavItemsOrderChange}>
          <Droppable
            droppableId="top-level"
            type="top-level"
            isCombineEnabled
            renderClone={renderClone}
          >
            {provided => (
              <ul ref={provided.innerRef}>
                {groupedNavItems.map(renderNavItemGroup)}
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
