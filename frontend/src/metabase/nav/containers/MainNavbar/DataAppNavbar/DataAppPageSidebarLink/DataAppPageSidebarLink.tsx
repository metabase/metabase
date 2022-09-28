import React from "react";
import type { DraggableProvidedDragHandleProps } from "react-beautiful-dnd";

import * as Urls from "metabase/lib/urls";

import type { DataApp, Dashboard } from "metabase-types/api";

import {
  DraggableSidebarLink,
  DraggableSidebarLinkProps,
} from "../../SidebarItems";
import { DataAppPageLink } from "./DataAppPageSidebarLink.styled";

interface Props extends Omit<DraggableSidebarLinkProps, "children"> {
  dataApp: DataApp;
  page: Dashboard;
  isSelected: boolean;
  indent?: number;

  dragHandleProps?: DraggableProvidedDragHandleProps;
}

const DataAppPageSidebarLink = React.forwardRef<HTMLLIElement, Props>(
  function DataAppPageSidebarLink(
    { dataApp, page, isSelected, indent = 0, dragHandleProps, ...props }: Props,
    ref,
  ) {
    return (
      <DataAppPageLink
        {...props}
        key={page.id}
        url={Urls.dataAppPage(dataApp, page)}
        isSelected={isSelected}
        indent={indent}
        DragHandle={<DraggableSidebarLink.Handle {...dragHandleProps} />}
        ref={ref}
      >
        {page.name}
      </DataAppPageLink>
    );
  },
);

export default DataAppPageSidebarLink;
