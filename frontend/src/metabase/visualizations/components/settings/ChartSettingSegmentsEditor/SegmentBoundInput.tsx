import { Box } from "metabase/ui";
import type {
  ColumnSettings,
  DatasetData,
  GoalForeignEntityRef,
  GoalValue,
  VisualizationDisplay,
} from "metabase-types/api";

import { GoalValueInput, StaticGoalValueInput } from "../GoalValueInput";

type Props = {
  "aria-label"?: string;
  data: DatasetData | undefined;
  display: VisualizationDisplay;
  formatOptions: ColumnSettings | undefined;
  goalSources: GoalForeignEntityRef[];
  id: string;
  placeholder: string;
  value: GoalValue | null;
  onChange: (value: GoalValue | null) => void;
};

export function SegmentBoundInput({
  "aria-label": ariaLabel,
  data,
  display,
  formatOptions,
  goalSources,
  id,
  placeholder,
  value,
  onChange,
}: Props) {
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
          display={display}
          formatOptions={formatOptions}
          goalSources={goalSources}
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      )}
    </Box>
  );
}
