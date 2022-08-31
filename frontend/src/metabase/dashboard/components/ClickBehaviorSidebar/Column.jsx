/* eslint-disable react/prop-types */
import React from "react";
import { t, jt, ngettext, msgid } from "ttag";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import { getIconForField } from "metabase/lib/schema_metadata";

import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import { SidebarItemWrapper, SidebarItemStyle } from "./SidebarItem";
import { SidebarIconWrapper } from "./ClickBehaviorSidebar.styled";

const LinkTargetName = ({ clickBehavior: { linkType, targetId } }) => (
  <span>
    {linkType === "url" ? (
      t`URL`
    ) : linkType === "question" ? (
      <span>
        {'"'}
        <Questions.Name id={targetId} />
        {'"'}
      </span>
    ) : linkType === "dashboard" ? (
      <span>
        {'"'}
        <Dashboards.Name id={targetId} />
        {'"'}
      </span>
    ) : (
      "Unknown"
    )}
  </span>
);

const Column = ({ column, clickBehavior, onClick }) => (
  <SidebarItemWrapper onClick={onClick} style={{ ...SidebarItemStyle }}>
    <SidebarIconWrapper>
      <Icon name={getIconForField(column)} color={color("brand")} size={18} />
    </SidebarIconWrapper>
    <div>
      <h4>
        {clickBehavior && clickBehavior.type === "crossfilter"
          ? (n =>
              ngettext(
                msgid`${column.display_name} updates ${n} filter`,
                `${column.display_name} updates ${n} filters`,
                n,
              ))(Object.keys(clickBehavior.parameterMapping || {}).length)
          : clickBehavior && clickBehavior.type === "link"
          ? jt`${column.display_name} goes to ${(
              <LinkTargetName clickBehavior={clickBehavior} />
            )}`
          : column.display_name}
      </h4>
    </div>
  </SidebarItemWrapper>
);

export default Column;
