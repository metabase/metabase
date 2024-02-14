import { t } from "ttag";
import type { DatasetColumn } from "metabase-types/api";
import * as Lib from "metabase-lib";
import type Field from "metabase-lib/metadata/Field";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  SemanticTypeLabel,
  FieldFingerprintInfo,
} from "./FieldInfo.styled";

export type FieldInfoProps = FieldInfoFieldProps | FieldInfoQueryProps;

export function FieldInfo(props: FieldInfoProps) {
  if ("field" in props) {
    return <FieldInfoField {...props} />;
  }

  return <FieldInfoQuery {...props} />;
}

// eslint-disable-next-line import/no-default-export
export default FieldInfo;

type FieldInfoFieldProps = {
  className?: string;
  /**
   * @deprecated prefer to use the MLv2 query props
   */
  field: Field | DatasetColumn;
  timezone?: string;
  showAllFieldValues?: boolean;
  showFingerprintInfo?: boolean;
};

export function FieldInfoField({
  className,
  field,
  timezone,
  showAllFieldValues,
  showFingerprintInfo,
}: FieldInfoFieldProps) {
  return (
    <InfoContainer className={className}>
      <ColumnDescription description={field.description} />
      <SemanticTypeLabel semanticType={field.semantic_type} />
      {showFingerprintInfo && (
        <FieldFingerprintInfo
          field={field}
          timezone={timezone}
          showAllFieldValues={showAllFieldValues}
        />
      )}
    </InfoContainer>
  );
}

type FieldInfoQueryProps = {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  timezone?: string;
  showAllFieldValues?: boolean;
  showFingerprintInfo?: boolean;
};

// TODO: support fingerprint info
export function FieldInfoQuery({
  className,
  query,
  stageIndex,
  column,
  showAllFieldValues,
  showFingerprintInfo,
  timezone,
}: FieldInfoQueryProps) {
  const { description, semanticType } = Lib.displayInfo(
    query,
    stageIndex,
    column,
  );

  return (
    <InfoContainer className={className}>
      <ColumnDescription description={description} />
      <SemanticTypeLabel semanticType={semanticType} />
      {showFingerprintInfo && (
        <FieldFingerprintInfo
          query={query}
          stageIndex={stageIndex}
          column={column}
          timezone={timezone}
          showAllFieldValues={showAllFieldValues}
        />
      )}
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
