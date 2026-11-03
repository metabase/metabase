import type { Ref } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import * as Lib from "metabase-lib";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  DetailPanel,
  DetailPanelHeader,
  FieldDetailsSkeleton,
} from "../DetailPanel";

import { FieldActionsMenu } from "./FieldActionsMenu";
import { FieldDetails } from "./FieldDetails";

interface FieldDetailsPanelProps {
  ref?: Ref<HTMLDivElement>;
  field: Field | undefined;
  table: Table | undefined;
  error: unknown;
  isLoading: boolean;
  defaultWidth: number;
  onWidthChange: (width: number) => void;
  getFieldHref: (fieldId: FieldId) => string;
  onClose: () => void;
  onPreviewClick: () => void;
}

/** The drawer panel for a single field: header, loading/error states, and settings. */
export function FieldDetailsPanel({
  ref,
  field,
  table,
  error,
  isLoading,
  defaultWidth,
  onWidthChange,
  getFieldHref,
  onClose,
  onPreviewClick,
}: FieldDetailsPanelProps) {
  return (
    <DetailPanel
      ref={ref}
      defaultWidth={defaultWidth}
      onWidthChange={onWidthChange}
    >
      <DetailPanelHeader
        icon={field ? getColumnIcon(Lib.legacyColumnTypeInfo(field)) : "list"}
        label={t`Field`}
        title={field?.display_name}
        isLoading={isLoading}
        actions={
          field && (
            <FieldActionsMenu
              fieldId={getRawTableFieldId(field)}
              onPreviewClick={onPreviewClick}
            />
          )
        }
        onClose={onClose}
        data-testid="field-section-header"
      />
      {error ? (
        <LoadingAndErrorWrapper error={error} />
      ) : isLoading ? (
        <FieldDetailsSkeleton />
      ) : field && table ? (
        <FieldDetails
          /**
           * Make sure internal component state is reset when changing fields.
           * This is to avoid state mix-up with optimistic updates.
           */
          key={getRawTableFieldId(field)}
          field={field}
          table={table}
          getFieldHref={getFieldHref}
        />
      ) : (
        <LoadingAndErrorWrapper error={t`Not found.`} />
      )}
    </DetailPanel>
  );
}
