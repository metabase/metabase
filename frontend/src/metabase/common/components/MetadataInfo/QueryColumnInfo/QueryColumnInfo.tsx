import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { Description, EmptyDescription } from "../MetadataInfo";
import { QueryColumnFingerprintInfo } from "../QueryColumnFingerprintInfo";
import { SemanticTypeLabel } from "../SemanticTypeLabel";

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
    <Stack
      className={cx(CS.overflowAuto, className)}
      pos="relative"
      gap="md"
      p="lg"
      data-testid="column-info"
    >
      <ColumnDescription description={description} />
      <Box fz="0.9em">
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
      </Box>
    </Stack>
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
