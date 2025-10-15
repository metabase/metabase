import { useSearchQuery } from "metabase/api";
import type { DatabaseId } from "metabase-types/api";

import type { DataPickerValue } from "../types";

interface Props {
  models: DataPickerValue["model"][];
  databaseId?: DatabaseId;
}

export const useAvailableData = ({ databaseId, models }: Props) => {
  const { data, isLoading } = useSearchQuery(
    {
      limit: 0,
      models,
      table_db_id: databaseId,
      calculate_available_models: true,
      include_dashboard_questions: true,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const availableModels = data?.available_models ?? [];
  const hasQuestions = availableModels.includes("card");
  const hasModels = availableModels.includes("dataset");
  const hasMetrics = availableModels.includes("metric");
  const hasTransforms = availableModels.includes("transform");

  return {
    isLoading,
    hasQuestions,
    hasModels,
    hasMetrics,
    hasTransforms,
  };
};
