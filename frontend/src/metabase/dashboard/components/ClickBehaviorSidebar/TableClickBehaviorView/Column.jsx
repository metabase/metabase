/* eslint-disable react/prop-types */
import React from "react";
import { t, jt, ngettext, msgid } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import { getIconForField } from "metabase/lib/schema_metadata";

import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import { SidebarItem } from "../SidebarItem";

function Quoted({ children }) {
  return (
    <span>
      {'"'}
      {children}
      {'"'}
    </span>
  );
}

const LinkTargetName = ({ clickBehavior: { linkType, targetId } }) => {
  if (linkType === "url") {
    return t`URL`;
  }
  if (linkType === "question") {
    return (
      <Quoted>
        <Questions.Name id={targetId} />
      </Quoted>
    );
  }
  if (linkType === "dashboard") {
    return (
      <Quoted>
        <Dashboards.Name id={targetId} />
      </Quoted>
    );
  }
  return t`Unknown`;
};

function ClickBehaviorDescription({ column, clickBehavior }) {
  if (!clickBehavior) {
    return column.display_name;
  }

  if (clickBehavior.type === "crossfilter") {
    const parameters = Object.keys(clickBehavior.parameterMapping || {});
    return (n =>
      ngettext(
        msgid`${column.display_name} updates ${n} filter`,
        `${column.display_name} updates ${n} filters`,
        n,
      ))(parameters.length);
  }

  if (clickBehavior.type === "link") {
    return jt`${column.display_name} goes to ${(
      <LinkTargetName clickBehavior={clickBehavior} />
    )}`;
  }

  return column.display_name;
}

const Column = ({ column, clickBehavior, onClick }) => (
  <SidebarItem onClick={onClick}>
    <SidebarItem.Icon
      name={getIconForField(column)}
      color={color("brand")}
      size={18}
    />
    <div>
      <SidebarItem.Name>
        <ClickBehaviorDescription
          column={column}
          clickBehavior={clickBehavior}
        />
      </SidebarItem.Name>
    </div>
  </SidebarItem>
);

export default Column;
