import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

/** Get the user's locale or, if that has not been set, the instance locale */
export const useLocale = () => {
  const instanceLocale = useSelector(state => getSetting(state, "site-locale"));
  const userLocale: string | undefined =
    useSelector(getCurrentUser)?.locale || undefined;
  return userLocale || instanceLocale;
};
