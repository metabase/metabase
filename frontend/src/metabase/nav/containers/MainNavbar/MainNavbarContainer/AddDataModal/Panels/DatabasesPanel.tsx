import { push } from "react-router-redux";

import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { useDispatch } from "metabase/lib/redux";

import { trackDatabaseSelect } from "../analytics";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
  returnTo,
}: {
  canSeeContent: boolean;
  returnTo?: string;
}) => {
  const dispatch = useDispatch();

  const handleDatabaseSelect = (key: string) => {
    trackDatabaseSelect(key);
    const params = new URLSearchParams({ engine: key });
    if (returnTo) {
      params.set("returnTo", returnTo);
    }
    dispatch(push(`/admin/databases/create?${params.toString()}`));
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
