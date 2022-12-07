import React from "react";
import { t, ngettext, msgid } from "ttag";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import Field from "metabase-lib/metadata/Field";
import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "./NodeList.styled";

interface FieldListProps {
  fields: Field[];
  onFieldClick: (field: Field) => void;
}

const FieldList = ({ fields, onFieldClick }: FieldListProps) => (
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
      const tooltip = field.semantic_type ? null : t`Unknown type`;
      return (
        <li key={field.getUniqueId()}>
          <NodeListItemLink onClick={() => onFieldClick(field)}>
            <NodeListItemIcon
              name={getSemanticTypeIcon(field.semantic_type, "warning")}
              tooltip={tooltip}
            />
            <NodeListItemName>{field.name}</NodeListItemName>
          </NodeListItemLink>
        </li>
      );
    })}
  </NodeListContainer>
);

export default FieldList;
