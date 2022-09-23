// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import { t, jt } from "ttag";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";

import {
  FieldListItem,
  FieldListItemName,
  FieldListItemIcon,
  FieldListTitle,
  FieldListContainer,
  FieldListIcon,
  FieldListTitleText,
} from "./FieldList.styled";

interface Props {
  fields: Field[];
  handleFieldClick: (field: Field) => any;
}

function FieldList({ fields, handleFieldClick }: Props) {
  return (
    <FieldListContainer>
      <FieldListTitle>
        <FieldListIcon name="table2" size="12" />
        <FieldListTitleText>{jt`${fields.length} columns`}</FieldListTitleText>
      </FieldListTitle>
      {fields.map(field => {
        const tooltip = field.semantic_type ? null : t`Unknown type`;
        return (
          <FieldListItem key={field.getUniqueId()}>
            <a onClick={() => handleFieldClick(field)}>
              <FieldListItemIcon
                name={getSemanticTypeIcon(field.semantic_type, "warning")}
                tooltip={tooltip}
              />
              <FieldListItemName>{field.displayName()}</FieldListItemName>
            </a>
          </FieldListItem>
        );
      })}
    </FieldListContainer>
  );
}

export default FieldList;
