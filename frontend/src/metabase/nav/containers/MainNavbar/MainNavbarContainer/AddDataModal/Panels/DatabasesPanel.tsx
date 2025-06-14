import { push } from "react-router-redux";

import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { useDispatch } from "metabase/lib/redux";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
}: {
  canSeeContent: boolean;
}) => {
  const dispatch = useDispatch();

  const handleDatabaseSelect = (key: string) => {
    dispatch(push(`/admin/databases/create?engine=${key}`));
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
