import { useSearchQuery } from "metabase/api";
import type { DatabaseId, SearchModel } from "metabase-types/api";

interface Props {
  databaseId?: DatabaseId;
  models?: SearchModel[];
}

export const useAvailableData = ({
  databaseId,
  models = ["card"],
}: Props = {}) => {
  const { data, isLoading } = useSearchQuery(
    {
      limit: 0,
      models,
      table_db_id: databaseId,
      calculate_available_models: true,
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const availableModels = data?.available_models ?? [];
  const hasQuestions = availableModels.includes("card");
  const hasModels = availableModels.includes("dataset");
  const hasMetrics = availableModels.includes("metric");

  return {
    isLoading,
    hasQuestions,
    hasModels,
    hasMetrics,
  };
};
