// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import { t, ngettext, msgid } from "ttag";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";

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

function NodeList({ fields, handleFieldClick }: Props) {
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
              <NodeListItemName>{field.displayName()}</NodeListItemName>
            </a>
          </NodeListItem>
        );
      })}
    </NodeListContainer>
  );
}

export default NodeList;
