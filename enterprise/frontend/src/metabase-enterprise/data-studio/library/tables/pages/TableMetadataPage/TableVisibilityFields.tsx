import { t } from "ttag";

import { SettingsRow } from "metabase/data-studio/common/components/SettingsSection";
import { useTableDataLayerSelect } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableAttributesEditSingle";
import {
  DATA_LAYER_VISIBILITY_ICONS,
  type DataLayer,
} from "metabase/metadata/data-layers";
import {
  getTableHiddenReason,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Icon, Select } from "metabase/ui";
import type { Table } from "metabase-types/api";

/**
 * PROTOTYPE: mocked. The table's data layer, its schema's unless it overrides
 * it, with who can see the table as a result as its help text
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
  const visibility = getVisibilityDescription(layer, hiddenReason);

  return (
    <SettingsRow
      label={t`Data layer`}
      description={
        isInherited
          ? visibility
          : t`${visibility} Overrides the ${table.schema} schema's layer.`
      }
    >
      <Select
        aria-label={t`Data layer`}
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
    </SettingsRow>
  );
}

/** Who can see the table: hidden for a reason, or who its data layer allows */
function getVisibilityDescription(
  layer: DataLayer | undefined,
  hiddenReason: string | null,
): string {
  if (hiddenReason != null) {
    // The reason is its own sentence, e.g. "Hidden in the table's settings"
    return t`This table is hidden. ${hiddenReason}.`;
  }
  return layer?.visibility === "admins"
    ? t`Only admins can see this table.`
    : t`Everyone can see this table.`;
}
