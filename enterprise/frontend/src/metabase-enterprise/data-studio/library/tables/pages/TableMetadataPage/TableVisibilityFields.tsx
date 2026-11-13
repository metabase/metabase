import { t } from "ttag";

import { useTableDataLayerSelect } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableAttributesEditSingle";
import { DATA_LAYER_VISIBILITY_ICONS } from "metabase/metadata/data-layers";
import {
  getTableHiddenReason,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Group, Icon, Input, Select, Stack, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

/**
 * PROTOTYPE: mocked. The table's data layer, its schema's unless it overrides
 * it, and whether people can find the table as a result
 */
export function TableVisibilityFields({
  table,
  readOnly,
}: {
  table: Table;
  readOnly: boolean;
}) {
  const { layer, isInherited, options, value, onChange } =
    useTableDataLayerSelect(table);
  const { role } = useTableStructures().getTableStructure(table);
  const hiddenReason = getTableHiddenReason({ table, role, dataLayer: layer });

  return (
    <Stack gap="xxl">
      <Select
        w="fit-content"
        miw="16rem"
        label={t`Data layer`}
        description={
          isInherited
            ? undefined
            : t`Overrides the ${table.schema} schema's layer`
        }
        data={options}
        value={value}
        allowDeselect={false}
        leftSection={
          layer && <Icon name={DATA_LAYER_VISIBILITY_ICONS[layer.visibility]} />
        }
        disabled={readOnly}
        onChange={onChange}
        data-testid="table-data-layer-input"
      />
      <Input.Wrapper label={t`Visibility`}>
        <Group gap="sm" mt="xs" wrap="nowrap" align="flex-start">
          <Icon
            name={hiddenReason ? "eye_crossed_out" : "eye"}
            c={hiddenReason ? "icon-disabled" : "core-brand"}
          />
          <Text>
            {hiddenReason
              ? t`Hidden: ${hiddenReason}`
              : t`Shown to people who can see its data layer`}
          </Text>
        </Group>
      </Input.Wrapper>
    </Stack>
  );
}
