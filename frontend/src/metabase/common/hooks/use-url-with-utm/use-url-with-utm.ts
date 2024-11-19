import { useSelector } from "metabase/lib/redux";
import { type UtmProps, getUrlWithUtm } from "metabase/selectors/settings";

export function useUrlWithUtm(url: string, utm: UtmProps) {
  return useSelector(state => getUrlWithUtm(state, { url, ...utm }));
}
