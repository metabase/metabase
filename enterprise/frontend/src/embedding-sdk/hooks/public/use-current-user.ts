import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

export const useCurrentUser = () => useSelector(getUser);
