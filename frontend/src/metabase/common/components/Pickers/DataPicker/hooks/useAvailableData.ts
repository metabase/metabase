import { useSearchQuery } from "metabase/api";
import type { DatabaseId } from "metabase-types/api";

interface Props {
  databaseId?: DatabaseId;
}

export const useAvailableData = ({ databaseId }: Props = {}) => {
  const { data, isLoading } = useSearchQuery(
    {
      limit: 0,
      models: ["card"],
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
  const hasTables = availableModels.includes("table");

  return {
    isLoading,
    hasQuestions,
    hasModels,
    hasMetrics,
    hasTables,
  };
};
