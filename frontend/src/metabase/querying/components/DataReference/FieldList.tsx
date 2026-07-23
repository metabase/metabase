import { useMemo } from "react";
import { msgid, ngettext } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Field from "metabase-lib/v1/metadata/Field";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import type { IconName } from "metabase-types/api";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
import S from "./NodeList.module.css";

const STAGE_INDEX = -1;

interface FieldListProps {
  table: Table;
  fields: Field[];
  onFieldClick: (field: Field) => void;
}

export const FieldList = ({ table, fields, onFieldClick }: FieldListProps) => {
  const metadata = useSelector(getMetadata);
  const columnQuery = useMemo(
    () => getColumnQuery(metadata, table),
    [metadata, table],
  );

  return (
    <DelayGroup>
      <NodeListContainer>
        <NodeListTitle>
          <NodeListIcon name="table2" size="12" />
          <NodeListTitleText>
            {ngettext(
              msgid`${fields.length} column`,
              `${fields.length} columns`,
              fields.length,
            )}
          </NodeListTitleText>
        </NodeListTitle>
        {fields.map((field) => {
          // field.icon() cannot be annotated to return IconName
          // because metabase-lib cannot import from metabase.
          const iconName = field.icon() as IconName;
          const column = columnQuery?.columnsByName.get(field.name);
          return (
            <HoverParent
              className={S.NodeListItem}
              as="li"
              key={field.getUniqueId()}
            >
              <NodeListItemLink onClick={() => onFieldClick(field)}>
                {columnQuery != null && column != null && (
                  <QueryColumnInfoIcon
                    className={S.nodeListInfoIcon}
                    query={columnQuery.query}
                    stageIndex={STAGE_INDEX}
                    column={column}
                    position="left"
                    icon={iconName}
                  />
                )}
                <NodeListItemName>{field.name}</NodeListItemName>
              </NodeListItemLink>
            </HoverParent>
          );
        })}
      </NodeListContainer>
    </DelayGroup>
  );
};

const getColumnQuery = (metadata: Metadata, table: Table) => {
  const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);

  if (tableMetadata == null) {
    return null;
  }

  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );
  const columnsByName = new Map(
    Lib.returnedColumns(query, STAGE_INDEX).map((column) => [
      Lib.displayInfo(query, STAGE_INDEX, column).name,
      column,
    ]),
  );

  return { query, columnsByName };
};
