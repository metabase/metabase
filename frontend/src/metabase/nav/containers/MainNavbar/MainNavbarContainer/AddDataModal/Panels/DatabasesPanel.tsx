import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";
import { useNavigate } from "metabase/router";

import { trackDatabaseSelect } from "../analytics";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
  fromEmbeddingSetupGuide,
}: {
  canSeeContent: boolean;
  fromEmbeddingSetupGuide?: boolean;
}) => {
  const navigate = useNavigate();

  const handleDatabaseSelect = (key: string) => {
    trackDatabaseSelect(key);
    const params = new URLSearchParams({ engine: key });
    if (fromEmbeddingSetupGuide) {
      params.set(RETURN_TO_SETUP_GUIDE_PARAM, "true");
    }
    navigate(`/admin/databases/create?${params.toString()}`);
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
