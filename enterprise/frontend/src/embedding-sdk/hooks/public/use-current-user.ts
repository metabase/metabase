import { useSelector } from "react-redux";

import { getUser } from "metabase/selectors/user";

export const useCurrentUser = () => useSelector(getUser);
