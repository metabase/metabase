import { useEffect } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-bundle/lib/provider-props-store";
import { setCustomLoader } from "metabase/ui/components/feedback/Loader/Loader";

export function useSdkCustomLoader() {
  const {
    state: { props: metabaseProviderProps },
  } = useMetabaseProviderPropsStore();

  useEffect(() => {
    setCustomLoader(metabaseProviderProps?.loaderComponent);
  }, [metabaseProviderProps?.loaderComponent]);
}
