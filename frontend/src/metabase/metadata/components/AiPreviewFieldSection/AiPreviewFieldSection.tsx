import { useMemo } from "react";
import _ from "underscore";

import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";
import {
  getRawTableFieldId,
  hasAiProposals,
} from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";

import { AiPreviewFieldset } from "../AiPreviewFieldset";
import { FieldSection } from "../FieldSection";

type AiPreviewFieldSectionProps = {
  field: Field;
  table: Table;
  /** Whether the pane reads the pending AI suggestions as if accepted. */
  isAiPreview: boolean;
  getFieldHref: (fieldId: FieldId) => string;
  onFieldValuesClick: () => void;
  onPreviewClick?: () => void;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

/** The field section of a field pane. It is read-only while it shows pending AI suggestions as if accepted. */
export function AiPreviewFieldSection({
  field,
  table,
  isAiPreview,
  getFieldHref,
  onFieldValuesClick,
  onPreviewClick,
  onTrackMetadataChange,
}: AiPreviewFieldSectionProps) {
  const fieldsByName = useMemo(
    () => _.indexBy(table.fields ?? [], (field) => field.name),
    [table],
  );
  const parent = fieldsByName[field.nfc_path?.[0] ?? ""];

  return (
    <AiPreviewFieldset isPreview={isAiPreview && hasAiProposals(field)}>
      <FieldSection
        /**
         * Make sure internal component state is reset when changing fields.
         * This is to avoid state mix-up with optimistic updates.
         */
        key={getRawTableFieldId(field)}
        field={field}
        parent={parent}
        table={table}
        getFieldHref={getFieldHref}
        onTrackMetadataChange={onTrackMetadataChange}
        onFieldValuesClick={onFieldValuesClick}
        onPreviewClick={onPreviewClick}
      />
    </AiPreviewFieldset>
  );
}
