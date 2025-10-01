import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

export const usePath = (): string | null => {
  const location = useSelector(getLocation);
  return location?.pathname;
}
