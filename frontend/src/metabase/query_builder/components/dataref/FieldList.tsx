import React from "react";
import { t, ngettext, msgid } from "ttag";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import Field from "metabase-lib/lib/metadata/Field";
import {
  NodeListItem,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "./NodeList.styled";

interface Props {
  fields: Field[];
  handleFieldClick: (field: Field) => any;
}

function FieldList({ fields, handleFieldClick }: Props) {
  return (
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
          <NodeListItem key={field.getUniqueId()}>
            <a onClick={() => handleFieldClick(field)}>
              <NodeListItemIcon
                name={getSemanticTypeIcon(field.semantic_type, "warning")}
                tooltip={tooltip}
              />
              <NodeListItemName>{field.name}</NodeListItemName>
            </a>
          </NodeListItem>
        );
      })}
    </NodeListContainer>
  );
}

export default FieldList;
