import { t } from "ttag";

import { useDataLayers } from "metabase/metadata/data-layers";
import type { Table } from "metabase-types/api";

// Select value for "no override": the table uses its schema's layer
const SCHEMA_LAYER_VALUE = "schema-layer";

/**
 * PROTOTYPE: mocked. A table uses its schema's data layer unless it overrides
 * it. The real `data_layer` column defaults to "internal", so it can't mean
 * "inherit"; the override lives in the mocked layer store instead. Returns
 * what a data layer Select needs.
 */
export function useTableDataLayerSelect(table: Table) {
  const {
    getDataLayers,
    getSchemaDataLayer,
    getTableDataLayer,
    setTableDataLayerId,
  } = useDataLayers();
  const schemaLayer = getSchemaDataLayer(table.db_id, table.schema);
  const { layer, isInherited } = getTableDataLayer(
    table.db_id,
    table.schema,
    table.id,
  );

  const options = [
    {
      value: SCHEMA_LAYER_VALUE,
      label: schemaLayer
        ? t`Schema's layer (${schemaLayer.name})`
        : t`Schema's layer`,
    },
    ...getDataLayers(table.db_id).map(({ id, name }) => ({
      value: id,
      label: name,
    })),
  ];

  const onChange = (value: string | null) => {
    if (value === SCHEMA_LAYER_VALUE) {
      setTableDataLayerId(table.db_id, table.id, null);
    } else if (value != null) {
      setTableDataLayerId(table.db_id, table.id, value);
    }
  };

  return {
    layer,
    isInherited,
    options,
    value: isInherited ? SCHEMA_LAYER_VALUE : (layer?.id ?? null),
    onChange,
  };
}
