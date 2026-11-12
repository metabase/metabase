import type { ReactNode } from "react";
import { jt, t } from "ttag";

import {
  type HistoryBinding,
  type VersionChoice,
  getDimensionTableForHistory,
  getVersionChoiceOptions,
  inferBindingForHistoryTable,
  useChangingAttributes,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { Stack, Text } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { joinFieldNames } from "./ChangingFieldsGroup";
import { DimensionChangePreview } from "./EndUserPreview";
import { InlineFieldSelect, InlineSelect } from "./InlineSelect";
import { singularName } from "./names";
import { useDimensionHistory } from "./use-dimension-history";

type HistorySentenceProps = {
  table: Table;
  readOnly: boolean;
};

/**
 * PROTOTYPE: mocked. Everything about a history table in one editable
 * sentence: whose versions it holds, how rows match, when each is true, what
 * it keeps, and what the facts that point at it show.
 */
export function HistorySentence({ table, readOnly }: HistorySentenceProps) {
  const { tables } = useSchemaTables(table);
  const historyTable = tables.find((other) => other.id === table.id) ?? table;
  const dimensionTable = getDimensionTableForHistory(historyTable, tables);
  if (dimensionTable == null) {
    return (
      <Text c="text-secondary">{t`No table in this schema looks like the current version of these rows.`}</Text>
    );
  }
  return (
    <HistorySentenceBody
      historyTable={historyTable}
      dimensionTable={dimensionTable}
      readOnly={readOnly}
    />
  );
}

function HistorySentenceBody({
  historyTable,
  dimensionTable,
  readOnly,
}: {
  historyTable: Table;
  dimensionTable: Table;
  readOnly: boolean;
}) {
  const history = useDimensionHistory(dimensionTable);
  const { getTableStructure, setHistoryBinding } = useTableStructures();
  const { getDimensionVersion, setDimensionVersion } = useChangingAttributes();
  const inferred = inferBindingForHistoryTable(dimensionTable, historyTable);
  const binding = getTableStructure(historyTable).history;
  const fields = historyTable.fields ?? [];
  const version = getDimensionVersion(dimensionTable);
  const reference = history.reference;
  const dimension = singularName(dimensionTable.display_name).toLowerCase();
  const attributes = joinFieldNames(history.trackedFields);
  const fieldSelect = (
    key: keyof Pick<
      HistoryBinding,
      "durableKeyFieldId" | "validFromFieldId" | "validToFieldId"
    >,
    fallback: FieldId | null,
    label: string,
  ) => (
    <InlineFieldSelect
      key={key}
      label={label}
      fields={fields}
      value={binding[key] ?? fallback}
      disabled={readOnly}
      onChange={(fieldId) =>
        setHistoryBinding(historyTable, { [key]: fieldId })
      }
    />
  );

  return (
    <Stack gap="lg">
      <Text lh={2.4}>
        {jt`Each row is one version of a ${(
          <strong key="dimension">{dimension}</strong>
        )}, matched on ${fieldSelect("durableKeyFieldId", inferred.keyFieldId, t`Matched on`)}. It was true from ${fieldSelect("validFromFieldId", inferred.validFromFieldId, t`True from`)} until ${fieldSelect("validToFieldId", inferred.validToFieldId, t`True until`)}. It keeps past ${(
          <strong key="attributes">{attributes}</strong>
        )}.`}
        {reference != null && (
          <>
            {" "}
            <VersionSentence
              facts={reference.table.display_name}
              fact={singularName(reference.table.display_name).toLowerCase()}
              eventDate={(
                history.eventDateField?.display_name ?? t`date`
              ).toLowerCase()}
              version={version}
              disabled={readOnly}
              onChange={(next) => setDimensionVersion(dimensionTable, next)}
            />
          </>
        )}
      </Text>
      {history.trackedFields[0] != null && (
        <DimensionChangePreview
          history={history}
          dimensionTable={dimensionTable}
          attribute={history.trackedFields[0]}
          version={version}
        />
      )}
    </Stack>
  );
}

function VersionSentence({
  facts,
  fact,
  eventDate,
  version,
  disabled,
  onChange,
}: {
  facts: string;
  fact: string;
  eventDate: string;
  version: VersionChoice;
  disabled: boolean;
  onChange: (version: VersionChoice) => void;
}): ReactNode {
  const options = getVersionChoiceOptions(t`values`, fact, eventDate);
  return jt`${<strong key="facts">{facts}</strong>} show ${(
    <InlineSelect
      key="version"
      label={t`Which value`}
      data={options.map(({ value, label }) => ({
        value,
        label: label.toLowerCase(),
      }))}
      value={version}
      disabled={disabled}
      onChange={(value) => {
        const option = options.find((option) => option.value === value);
        if (option) {
          onChange(option.value);
        }
      }}
    />
  )}.`;
}
