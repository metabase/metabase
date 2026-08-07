import { t } from "ttag";

import { Box, Text } from "metabase/ui";
import type { GoalRefError } from "metabase/visualizations/lib/dynamic-goals";
import { resolveGoalValue } from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData, GoalValue } from "metabase-types/api";

import { GoalValueInput } from "./GoalValueInput";
import { StaticGoalValueInput } from "./StaticGoalValueInput";

export type SegmentBoundInputProps = {
  id: string;
  ariaLabel: string;
  placeholder: string;
  value: GoalValue | null;
  /** Present only when this bound may reference another column or entity. */
  data?: DatasetData;
  canReferenceOtherEntities?: boolean;
  onChange: (value: GoalValue | null) => void;
};

/** One end of a color range, with the reason it couldn't be resolved below it. */
export function SegmentBoundInput({
  id,
  ariaLabel,
  placeholder,
  value,
  data,
  canReferenceOtherEntities = true,
  onChange,
}: SegmentBoundInputProps) {
  const error = data != null ? resolveGoalValue(data, value).error : undefined;

  return (
    <Box flex={1} miw={0}>
      {data != null ? (
        <GoalValueInput
          id={id}
          ariaLabel={ariaLabel}
          placeholder={placeholder}
          value={value}
          data={data}
          canReferenceOtherEntities={canReferenceOtherEntities}
          onChange={onChange}
        />
      ) : (
        <StaticGoalValueInput
          id={id}
          ariaLabel={ariaLabel}
          placeholder={placeholder}
          value={value}
          onCommit={onChange}
        />
      )}
      {error != null && (
        <Text c="error" fz="sm" mt="xs">
          {getGoalErrorMessage(error)}
        </Text>
      )}
    </Box>
  );
}

function getGoalErrorMessage({ reason, message }: GoalRefError): string {
  switch (reason) {
    case "query-failed":
      return message ?? t`Couldn't load this value`;
    case "column-not-found":
      return t`This column no longer exists`;
    case "not-a-number":
      return t`This value isn't a number`;
  }
}
