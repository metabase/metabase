import { useSelector } from "metabase/lib/redux";
import { type UtmProps, getUrlWithUtm } from "metabase/selectors/settings";

export function useUrlWithUtm(url: string, utm: UtmProps): string;
export function useUrlWithUtm(url: undefined, utm: UtmProps): undefined;
export function useUrlWithUtm(
  url: string | undefined,
  utm: UtmProps,
): string | undefined;
export function useUrlWithUtm(url: string | undefined, utm: UtmProps) {
  return useSelector((state) => {
    if (!url) {
      return undefined;
    }
    return getUrlWithUtm(state, { url, ...utm });
  });
}
