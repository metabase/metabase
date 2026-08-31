import { useMemo } from "react";
import { msgid, ngettext } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import { getMetadata } from "metabase/metadata-store";
import { getQueryAndColumns } from "metabase/querying/common/utils";
import { useSelector } from "metabase/redux";
import { DelayGroup } from "metabase/ui";
import {
  getIconForField,
  getUniqueFieldId,
} from "metabase-lib/v1/metadata/utils/fields";
import type { Field, IconName, Table } from "metabase-types/api";

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
  table: Pick<Table, "id" | "db_id">;
  fields: Field[];
  onFieldClick: (field: Field) => void;
}

export const FieldList = ({ table, fields, onFieldClick }: FieldListProps) => {
  const metadata = useSelector(getMetadata);
  const queryAndColumns = useMemo(
    () => getQueryAndColumns(metadata, table, fields),
    [metadata, table, fields],
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
          const queryAndColumn = queryAndColumns.get(field);
          return (
            queryAndColumn && (
              <HoverParent
                className={S.NodeListItem}
                as="li"
                key={getUniqueFieldId(field)}
              >
                <NodeListItemLink onClick={() => onFieldClick(field)}>
                  <QueryColumnInfoIcon
                    className={S.nodeListInfoIcon}
                    query={queryAndColumn.query}
                    stageIndex={STAGE_INDEX}
                    column={queryAndColumn.column}
                    position="left"
                    // `getIconForField` takes an untyped field and returns a
                    // literal from its own icon map, so it is always an
                    // `IconName`; it cannot say so without importing from
                    // `metabase`, which `metabase-lib` may not do.
                    icon={getIconForField(field) as IconName}
                  />
                  <NodeListItemName>{field.name}</NodeListItemName>
                </NodeListItemLink>
              </HoverParent>
            )
          );
        })}
      </NodeListContainer>
    </DelayGroup>
  );
};
