import type * as React from "react";
import { t, jt, ngettext, msgid } from "ttag";

import { color } from "metabase/lib/colors";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";

import type {
  ClickBehavior,
  CustomDestinationClickBehavior,
  DatasetColumn,
  EntityCustomDestinationClickBehavior,
} from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";
import { getIconForField } from "metabase-lib/metadata/utils/fields";

import { SidebarItem } from "../SidebarItem";

function Quoted({ children }: { children: React.ReactNode }) {
  return (
    <span>
      {'"'}
      {children}
      {'"'}
    </span>
  );
}

const getLinkTargetName = (clickBehavior: CustomDestinationClickBehavior) => {
  const { targetId } = clickBehavior as EntityCustomDestinationClickBehavior;
  if (clickBehavior.linkType === "url") {
    return t`URL`;
  }
  if (clickBehavior.linkType === "question") {
    return (
      <Quoted>
        <Questions.Name id={targetId} />
      </Quoted>
    );
  }
  if (clickBehavior.linkType === "dashboard") {
    return (
      <Quoted>
        <Dashboards.Name id={targetId} />
      </Quoted>
    );
  }
  return t`Unknown`;
};

function getClickBehaviorDescription({
  column,
  clickBehavior,
}: {
  column: DatasetColumn;
  clickBehavior: ClickBehavior;
}) {
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
    return jt`${column.display_name} goes to ${getLinkTargetName(
      clickBehavior,
    )}`;
  }

  return column.display_name;
}

interface ColumnProps {
  column: DatasetColumn;
  clickBehavior: ClickBehavior;
  onClick: () => void;
}

export const Column = ({ column, clickBehavior, onClick }: ColumnProps) => (
  <SidebarItem onClick={onClick}>
    <SidebarItem.Icon
      name={getIconForField(column) as unknown as IconName}
      color={color("brand")}
      size={18}
    />
    <div>
      <SidebarItem.Name>
        {getClickBehaviorDescription({ column, clickBehavior })}
      </SidebarItem.Name>
    </div>
  </SidebarItem>
);
