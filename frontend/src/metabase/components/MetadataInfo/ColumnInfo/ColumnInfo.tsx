import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatasetColumn } from "metabase-types/api";

import {
  QueryColumnFingerprintInfo,
  TableColumnFingerprintInfo,
} from "../ColumnFingerprintInfo";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import { SemanticTypeLabel } from "../SemanticTypeLabel";

import { InfoContainer, Small } from "./ColumnInfo.styled";

export type TableColumnInfoProps = {
  className?: string;
  field: Field | DatasetColumn;
  timezone?: string;
  showAllFieldValues?: boolean;
  showFingerprintInfo?: boolean;
};

/**
 * @deprecated prefer to use the MLv2 query props
 */
export function TableColumnInfo({
  className,
  field,
  timezone,
  showAllFieldValues,
  showFingerprintInfo,
}: TableColumnInfoProps) {
  return (
    <InfoContainer className={className}>
      <ColumnDescription description={field.description} />
      <Small>
        <SemanticTypeLabel semanticType={field.semantic_type} />
        {showFingerprintInfo && (
          <TableColumnFingerprintInfo
            field={field}
            timezone={timezone}
            showAllFieldValues={showAllFieldValues}
          />
        )}
      </Small>
    </InfoContainer>
  );
}

export type QueryColumnInfoProps = {
  className?: string;
  query?: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  timezone?: string;
  showAllFieldValues?: boolean;
  showFingerprintInfo?: boolean;
};

export function QueryColumnInfo({
  className,
  query,
  stageIndex,
  column,
  showAllFieldValues,
  showFingerprintInfo,
  timezone,
}: QueryColumnInfoProps) {
  const { description = "", semanticType = null } = query
    ? Lib.displayInfo(query, stageIndex, column)
    : {};

  return (
    <InfoContainer className={className}>
      <ColumnDescription description={description} />
      <Small>
        <SemanticTypeLabel semanticType={semanticType} />
        {query && showFingerprintInfo && (
          <QueryColumnFingerprintInfo
            query={query}
            stageIndex={stageIndex}
            column={column}
            timezone={timezone}
            showAllFieldValues={showAllFieldValues}
          />
        )}
      </Small>
    </InfoContainer>
  );
}

type ColumnDescriptionProps = {
  description?: string | null;
};

function ColumnDescription({ description }: ColumnDescriptionProps) {
  if (!description) {
    return <EmptyDescription>{t`No description`}</EmptyDescription>;
  }
  return <Description>{description}</Description>;
}
