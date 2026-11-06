import { msgid, ngettext } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
import S from "./NodeList.module.css";

interface FieldListProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  onColumnClick: (
    query: Lib.Query,
    stageIndex: number,
    column: Lib.ColumnMetadata,
  ) => void;
}

export const FieldList = ({
  query,
  stageIndex,
  columns,
  onColumnClick,
}: FieldListProps) => {
  return (
    <DelayGroup>
      <NodeListContainer>
        <NodeListTitle>
          <NodeListIcon name="table2" size="12" />
          <NodeListTitleText>
            {ngettext(
              msgid`${columns.length} column`,
              `${columns.length} columns`,
              columns.length,
            )}
          </NodeListTitleText>
        </NodeListTitle>
        {columns.map((column) => {
          const { name } = Lib.displayInfo(query, stageIndex, column);
          return (
            <HoverParent className={S.NodeListItem} as="li" key={name}>
              <NodeListItemLink
                onClick={() => onColumnClick(query, stageIndex, column)}
              >
                <QueryColumnInfoIcon
                  className={S.nodeListInfoIcon}
                  query={query}
                  stageIndex={stageIndex}
                  column={column}
                  position="left"
                  icon={getColumnIcon(column)}
                />
                <NodeListItemName>{name}</NodeListItemName>
              </NodeListItemLink>
            </HoverParent>
          );
        })}
      </NodeListContainer>
    </DelayGroup>
  );
};
