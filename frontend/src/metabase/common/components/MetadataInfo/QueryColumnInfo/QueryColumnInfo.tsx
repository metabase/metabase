import { t } from "ttag";

import * as Lib from "metabase-lib";

import { QueryColumnFingerprintInfo } from "../ColumnFingerprintInfo";
import { Description, EmptyDescription } from "../MetadataInfo";
import { SemanticTypeLabel } from "../SemanticTypeLabel";

import { InfoContainer, Small } from "./QueryColumnInfo.styled";

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
    <InfoContainer className={className} data-testid="column-info">
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
