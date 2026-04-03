import { push } from "react-router-redux";

import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { useDispatch } from "metabase/lib/redux";

import { trackDatabaseSelect } from "../analytics";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
  onNavigate,
}: {
  canSeeContent: boolean;
  onNavigate?: (url: string) => void;
}) => {
  const dispatch = useDispatch();

  const handleDatabaseSelect = (key: string) => {
    trackDatabaseSelect(key);
    const url = `/admin/databases/create?engine=${key}`;
    if (onNavigate) {
      onNavigate(url);
    } else {
      dispatch(push(url));
    }
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
