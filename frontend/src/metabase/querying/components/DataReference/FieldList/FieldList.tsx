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
} from "../NodeList";
import S from "../NodeList.module.css";

interface FieldListProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  onColumnClick: (columnIndex: number) => void;
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
        {columns.map((column, columnIndex) => {
          const { name } = Lib.displayInfo(query, stageIndex, column);
          return (
            <HoverParent className={S.NodeListItem} as="li" key={columnIndex}>
              <NodeListItemLink onClick={() => onColumnClick(columnIndex)}>
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
