import { useSelector } from "react-redux";
import { getCurrentUser } from "metabase/admin/datamodel/selectors";

export const useCurrentUser = () => useSelector(getCurrentUser);
