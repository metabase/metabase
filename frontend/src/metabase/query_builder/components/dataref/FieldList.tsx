import { t, ngettext, msgid } from "ttag";
import type { IconName } from "metabase/ui";
import type Field from "metabase-lib/metadata/Field";
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
      // field.icon() cannot be annotated to return IconName
      // because metabase-lib cannot import from metabase.
      const iconName = field.icon() as IconName;
      const tooltip = iconName === "unknown" ? t`Unknown type` : null;
      return (
        <li key={field.getUniqueId()}>
          <NodeListItemLink onClick={() => onFieldClick(field)}>
            <NodeListItemIcon name={iconName} tooltip={tooltip} />
            <NodeListItemName>{field.name}</NodeListItemName>
          </NodeListItemLink>
        </li>
      );
    })}
  </NodeListContainer>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldList;
