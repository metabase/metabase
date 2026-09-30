import { Box } from "metabase/ui";
import type {
  DatasetData,
  DatasetQuery,
  GoalValue,
  ReferencedEntity,
  VisualizationSettings,
} from "metabase-types/api";

import { GoalValueInput, StaticGoalValueInput } from "../GoalValueInput";

type Props = {
  "aria-label"?: string;
  data: DatasetData | undefined;
  datasetQuery: DatasetQuery | undefined;
  id: string;
  placeholder: string;
  referencedEntities: ReferencedEntity[];
  value: GoalValue | null;
  visualizationSettings: VisualizationSettings | undefined;
  onChange: (value: GoalValue | null) => void;
};

export function SegmentBoundInput({
  "aria-label": ariaLabel,
  data,
  datasetQuery,
  id,
  placeholder,
  referencedEntities,
  value,
  visualizationSettings,
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
          datasetQuery={datasetQuery}
          id={id}
          placeholder={placeholder}
          referencedEntities={referencedEntities}
          value={value}
          visualizationSettings={visualizationSettings}
          onChange={onChange}
        />
      )}
    </Box>
  );
}
