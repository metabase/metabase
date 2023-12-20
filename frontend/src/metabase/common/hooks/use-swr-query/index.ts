import type { SWRConfiguration } from "swr";
import useSWR from "swr";
import { GET } from "metabase/lib/api";

export function useSWRQuery<DataType>(url: string, options?: SWRConfiguration) {
  return useSWR<DataType>(url, GET(url), options);
}

export const NO_REVALIDATE_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnMount: false,
  revalidateOnReconnect: false,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  refreshInterval: 0,
};
