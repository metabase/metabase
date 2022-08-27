/* eslint-disable react/prop-types */
import React from "react";
import { jt } from "ttag";

import Icon from "metabase/components/Icon";

import { Heading, SidebarHeader } from "../ClickBehaviorSidebar.styled";

function DefaultHeader({ children }) {
  return (
    <Heading>{jt`Click behavior for ${(
      <span className="text-brand">{children}</span>
    )}`}</Heading>
  );
}

function ColumnClickBehaviorHeader({ children, onUnsetColumn }) {
  return (
    <div
      onClick={onUnsetColumn}
      className="flex align-center text-brand-hover cursor-pointer"
    >
      <div
        className="bordered"
        style={{
          marginRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          paddingRight: 6,
          paddingLeft: 6,
          borderRadius: 4,
        }}
      >
        <Icon name="chevronleft" className="text-medium" size={12} />
      </div>
      <Heading>
        {jt`Click behavior for ${(
          <span className="text-brand">{children}</span>
        )}`}
      </Heading>
    </div>
  );
}

function ClickBehaviorSidebarHeader({
  dashcard,
  selectedColumn,
  hasSelectedColumn,
  onUnsetColumn,
}) {
  return (
    <SidebarHeader>
      {!hasSelectedColumn ? (
        <DefaultHeader>{dashcard.card.name}</DefaultHeader>
      ) : (
        <ColumnClickBehaviorHeader onUnsetColumn={onUnsetColumn}>
          {selectedColumn.display_name}
        </ColumnClickBehaviorHeader>
      )}
    </SidebarHeader>
  );
}

export default ClickBehaviorSidebarHeader;
