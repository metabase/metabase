import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";

export const useApplicationName = () => useSelector(getApplicationName);
