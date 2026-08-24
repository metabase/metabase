import { match } from "ts-pattern";
import { t } from "ttag";

import { Box, Text } from "metabase/ui";
import type { GoalRefError } from "metabase/visualizations/lib/dynamic-goals";
import type { DatasetData, DatasetQuery, GoalValue } from "metabase-types/api";

import { GoalValueInput } from "./GoalValueInput";
import { StaticGoalValueInput } from "./StaticGoalValueInput";
import { useResolvedGoalValue } from "./use-resolved-goal-value";

type Props = {
  "aria-label"?: string;
  data: DatasetData | undefined;
  datasetQuery: DatasetQuery | undefined;
  id: string;
  placeholder: string;
  value: GoalValue | null;
  onChange: (value: GoalValue | null) => void;
};

export function SegmentBoundInput({
  "aria-label": ariaLabel,
  data,
  datasetQuery,
  id,
  placeholder,
  value,
  onChange,
}: Props) {
  const { error } = useResolvedGoalValue(datasetQuery, data, value);

  return (
    <Box flex={1} miw={0}>
      {data == null ? (
        <StaticGoalValueInput
          aria-label={ariaLabel}
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      ) : (
        <GoalValueInput
          aria-label={ariaLabel}
          data={data}
          datasetQuery={datasetQuery}
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
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
  return match(reason)
    .with("query-failed", () => message ?? t`Couldn't load this value`)
    .with("column-not-found", () => t`This column no longer exists`)
    .with("not-a-number", () => t`This value isn't a number`)
    .exhaustive();
}
