import React from "react";

import * as Urls from "metabase/lib/urls";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";

import { getDataAppIcon } from "metabase/entities/data-apps";

import type { DataApp } from "metabase-types/api";

import { DataAppLink } from "./SidebarDataAppLink.styled";

type DroppableProps = {
  hovered: boolean;
  highlighted: boolean;
};

interface Props {
  dataApp: DataApp;
  isSelected: boolean;
}

function SidebarDataAppLink({
  dataApp,
  hovered: isHovered,
  isSelected,
}: Props & DroppableProps) {
  const url = Urls.dataApp(dataApp, { mode: "preview" });
  return (
    <DataAppLink
      url={url}
      icon={getDataAppIcon(dataApp)}
      isSelected={isSelected}
      isHovered={isHovered}
    >
      {dataApp.collection.name}
    </DataAppLink>
  );
}

function DroppableSidebarDataAppLink({ dataApp, ...props }: Props) {
  return (
    <div data-testid="sidebar-collection-link-root">
      <CollectionDropTarget collection={dataApp.collection}>
        {(droppableProps: DroppableProps) => (
          <SidebarDataAppLink
            dataApp={dataApp}
            {...props}
            {...droppableProps}
          />
        )}
      </CollectionDropTarget>
    </div>
  );
}

export default DroppableSidebarDataAppLink;
