import { useEffect } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { setCustomLoader } from "metabase/ui/components/feedback/Loader/Loader";

export function useSdkCustomLoader() {
  const {
    state: { props: metabaseProviderProps },
  } = useMetabaseProviderPropsStore();

  useEffect(() => {
    setCustomLoader(metabaseProviderProps?.loaderComponent);
  }, [metabaseProviderProps?.loaderComponent]);
}
