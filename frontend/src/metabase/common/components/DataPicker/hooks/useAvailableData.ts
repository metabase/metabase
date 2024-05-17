import { useSearchQuery } from "metabase/api";
import type { DatabaseId } from "metabase-types/api";

interface Props {
  databaseId?: DatabaseId;
}

export const useAvailableData = ({ databaseId }: Props = {}) => {
  const { data } = useSearchQuery({
    limit: 0,
    models: ["card"],
    table_db_id: databaseId,
  });
  const availableModels = data?.available_models ?? [];

  return {
    availableModels,
  };
};
