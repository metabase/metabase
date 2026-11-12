import { t } from "ttag";

import {
  getVersionChoiceOptions,
  useChangingAttributes,
  useSchemaTables,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Card, SegmentedControl, Stack, Text } from "metabase/ui";
import { isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, Measure, Table } from "metabase-types/api";

import { joinFieldNames } from "./ChangingFieldsGroup";
import { DimensionChangePreview } from "./EndUserPreview";
import { HistorySettingsLink } from "./PastValuesRows";
import { singularName } from "./names";
import { useDimensionHistory } from "./use-dimension-history";

type MeasureVersionSectionProps = {
  measure: Measure;
  table: Table;
  readOnly: boolean;
};

/**
 * PROTOTYPE: mocked. The measure decides which version of a changing
 * dimension it's grouped by, since that depends on what it measures.
 */
export function MeasureVersionSection({
  measure,
  table,
  readOnly,
}: MeasureVersionSectionProps) {
  const { tables } = useSchemaTables(table);
  const fullTable = tables.find((other) => other.id === table.id) ?? table;
  const dimensions = (fullTable.fields ?? []).flatMap((fkField) => {
    const dimensionTable = isFK(fkField)
      ? tables.find((other) =>
          (other.fields ?? []).some(
            (field) => getRawTableFieldId(field) === fkField.fk_target_field_id,
          ),
        )
      : undefined;
    return dimensionTable ? [{ fkField, dimensionTable }] : [];
  });

  return (
    <>
      {dimensions.map(({ fkField, dimensionTable }) => (
        <MeasureDimensionCard
          key={getRawTableFieldId(fkField)}
          measure={measure}
          factTable={fullTable}
          fkField={fkField}
          dimensionTable={dimensionTable}
          readOnly={readOnly}
        />
      ))}
    </>
  );
}

function MeasureDimensionCard({
  measure,
  factTable,
  fkField,
  dimensionTable,
  readOnly,
}: {
  measure: Measure;
  factTable: Table;
  fkField: Field;
  dimensionTable: Table;
  readOnly: boolean;
}) {
  const history = useDimensionHistory(dimensionTable);
  const { getMeasureVersion, setMeasureVersion } = useChangingAttributes();
  const { historyTable, trackedFields } = history;
  if (historyTable == null || trackedFields.length === 0) {
    return null;
  }
  const version = getMeasureVersion(measure.id);
  const dimension = fkField.display_name;
  const fact = singularName(factTable.display_name).toLowerCase();
  const options = getVersionChoiceOptions(
    t`values`,
    fact,
    (history.eventDateField?.display_name ?? t`date`).toLowerCase(),
  );
  const attributes = joinFieldNames(trackedFields);

  return (
    <Card withBorder p="xxl">
      <Stack gap="lg">
        <Stack gap="xs">
          <Text fw="bold">{t`When ${measure.name} is grouped by ${dimension.toLowerCase()} ${attributes}`}</Text>
          <Text size="sm" c="text-secondary">
            {t`A ${dimension.toLowerCase()}'s ${attributes} change over time. Pick which one each ${fact} counts under.`}
          </Text>
        </Stack>
        <SegmentedControl
          w="fit-content"
          disabled={readOnly}
          data={options.map(({ value, label }) => ({ value, label }))}
          value={version}
          onChange={(value) => {
            const option = options.find((option) => option.value === value);
            if (option) {
              setMeasureVersion(measure.id, option.value);
            }
          }}
        />
        <DimensionChangePreview
          history={{
            ...history,
            reference: { table: factTable, field: fkField },
          }}
          dimensionTable={dimensionTable}
          attribute={trackedFields[0]}
          version={version}
        />
        <HistorySettingsLink table={historyTable} />
      </Stack>
    </Card>
  );
}
