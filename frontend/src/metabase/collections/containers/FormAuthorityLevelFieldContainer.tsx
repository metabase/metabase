import { PLUGIN_COLLECTION_COMPONENTS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";

export function FormAuthorityLevelField() {
  const isAdmin = useSelector(getUserIsAdmin);
  if (!isAdmin) {
    return null;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.FormCollectionAuthorityLevelPicker name="authority_level" />
  );
}
