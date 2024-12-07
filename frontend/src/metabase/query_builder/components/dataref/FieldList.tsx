import { msgid, ngettext } from "ttag";

import {
  HoverParent,
  TableColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import type { IconName } from "metabase/ui";
import { DelayGroup } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";

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
  fields: Field[];
  onFieldClick: (field: Field) => void;
}

const FieldList = ({ fields, onFieldClick }: FieldListProps) => (
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
      {fields.map(field => {
        // field.icon() cannot be annotated to return IconName
        // because metabase-lib cannot import from metabase.
        const iconName = field.icon() as IconName;
        return (
          <HoverParent
            className={S.NodeListItem}
            as="li"
            key={field.getUniqueId()}
          >
            <NodeListItemLink onClick={() => onFieldClick(field)}>
              <TableColumnInfoIcon
                className={S.nodeListInfoIcon}
                field={field}
                position="left"
                icon={iconName}
              />
              <NodeListItemName>{field.name}</NodeListItemName>
            </NodeListItemLink>
          </HoverParent>
        );
      })}
    </NodeListContainer>
  </DelayGroup>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldList;
