import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { useNavigation } from "metabase/routing/compat";

import { trackDatabaseSelect } from "../analytics";

import { DatabasePanelEmptyState } from "./AddDataModalEmptyStates";

export const DatabasesPanel = ({
  canSeeContent,
}: {
  canSeeContent: boolean;
}) => {
  const { push } = useNavigation();

  const handleDatabaseSelect = (key: string) => {
    trackDatabaseSelect(key);
    push(`/admin/databases/create?engine=${key}`);
  };

  return canSeeContent ? (
    <DatabaseEngineList onSelect={handleDatabaseSelect} />
  ) : (
    <DatabasePanelEmptyState />
  );
};
