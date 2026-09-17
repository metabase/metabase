import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Group, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import S from "./ModelFields.module.css";

export type ModelFieldsProps = {
  fields: Field[];
};

export function ModelFields({ fields }: ModelFieldsProps) {
  if (fields.length === 0) {
    return (
      <Text c="text-secondary">{t`This model has no column metadata yet.`}</Text>
    );
  }

  return (
    <table className={S.table}>
      <thead>
        <tr>
          <th>{t`Field`}</th>
          <th>{t`Type`}</th>
          <th>{t`Description`}</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field, index) => (
          <tr key={`${field.name}-${index}`}>
            <td>
              <Group gap="sm" wrap="nowrap">
                <Icon
                  name={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
                  c="text-secondary"
                  size={14}
                />
                <Text>{field.display_name || field.name}</Text>
              </Group>
            </td>
            <td>
              <Text ff="monospace" size="xs" c="text-secondary">
                {field.semantic_type ?? field.effective_type ?? field.base_type}
              </Text>
            </td>
            <td>
              <Text c={field.description ? undefined : "text-tertiary"}>
                {field.description || "—"}
              </Text>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
