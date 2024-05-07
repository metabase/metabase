import { useSearchQuery } from "metabase/api";

export const useAvailableData = () => {
  const { data } = useSearchQuery({ limit: 0 });
  const availableModels = data?.available_models ?? [];
  const hasModels = availableModels.includes("dataset");
  const hasQuestions = availableModels.includes("card");

  return {
    hasModels,
    hasQuestions,
  };
};
