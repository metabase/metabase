import { t, ngettext, msgid } from "ttag";
import type { IconName } from "metabase/ui";
import type { Field } from "metabase-types/api";
import type LegacyField from "metabase-lib/metadata/Field";
import { getIconForField } from "metabase-lib/metadata/utils/fields";
import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "./NodeList.styled";

interface FieldListProps<T extends Field | LegacyField> {
  fields: T[];
  onFieldClick: (field: T) => void;
}

function FieldList<T extends Field | LegacyField>({
  fields,
  onFieldClick,
}: FieldListProps<T>) {
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
      {fields.map((field, index) => {
        // field.icon() cannot be annotated to return IconName
        // because metabase-lib cannot import from metabase.
        const iconName = getIconForField(field) as IconName;
        const tooltip = iconName === "unknown" ? t`Unknown type` : null;
        return (
          <li key={index}>
            <NodeListItemLink onClick={() => onFieldClick(field)}>
              <NodeListItemIcon name={iconName} tooltip={tooltip} />
              <NodeListItemName>{field.name}</NodeListItemName>
            </NodeListItemLink>
          </li>
        );
      })}
    </NodeListContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldList;
