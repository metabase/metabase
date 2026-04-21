import { push } from "react-router-redux";

import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embed/constants";
import { useDispatch } from "metabase/utils/redux";

import { trackDatabaseSelect } from "../analytics";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
  fromEmbeddingSetupGuide,
}: {
  canSeeContent: boolean;
  fromEmbeddingSetupGuide?: boolean;
}) => {
  const dispatch = useDispatch();

  const handleDatabaseSelect = (key: string) => {
    trackDatabaseSelect(key);
    const params = new URLSearchParams({ engine: key });
    if (fromEmbeddingSetupGuide) {
      params.set(RETURN_TO_SETUP_GUIDE_PARAM, "true");
    }
    dispatch(push(`/admin/databases/create?${params.toString()}`));
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
