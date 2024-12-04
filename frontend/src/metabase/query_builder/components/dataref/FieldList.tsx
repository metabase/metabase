import { msgid, ngettext } from "ttag";

import {
  HoverParent,
  TableColumnInfoIcon,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import type { IconName } from "metabase/ui";
import { DelayGroup, Text } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemLink,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
import CS from "./NodeList.module.css";

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
            className={CS.NodeListItem}
            as="li"
            key={field.getUniqueId()}
          >
            <NodeListItemLink onClick={() => onFieldClick(field)}>
              <TableColumnInfoIcon
                className={CS.nodeListInfoIcon}
                field={field}
                position="left"
                icon={iconName}
              />
              <Text component="span" fw={700} ml="sm">
                {field.name}
              </Text>
            </NodeListItemLink>
          </HoverParent>
        );
      })}
    </NodeListContainer>
  </DelayGroup>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldList;
