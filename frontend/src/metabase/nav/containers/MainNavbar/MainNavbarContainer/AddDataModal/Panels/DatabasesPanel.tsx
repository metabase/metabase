import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";
import { useNavigate } from "metabase/router";

import { trackDatabaseSelect } from "../analytics";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
  returnToSetupGuide,
}: {
  canSeeContent: boolean;
  /** Path of the setup guide that opened this, so the flow can return there. */
  returnToSetupGuide?: string;
}) => {
  const navigate = useNavigate();

  const handleDatabaseSelect = (key: string) => {
    trackDatabaseSelect(key);
    const params = new URLSearchParams({ engine: key });
    if (returnToSetupGuide) {
      params.set(RETURN_TO_SETUP_GUIDE_PARAM, returnToSetupGuide);
    }
    navigate(`/admin/databases/create?${params.toString()}`);
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
