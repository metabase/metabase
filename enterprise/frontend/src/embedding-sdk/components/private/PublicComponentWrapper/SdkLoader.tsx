import { useSdkSelector } from "embedding-sdk/store";
import { getLoaderComponent } from "embedding-sdk/store/selectors";
import { Loader } from "metabase/ui";

export const SdkLoader = () => {
  const CustomLoader = useSdkSelector(getLoaderComponent);

  const LoaderComponent = CustomLoader || Loader;

  return <LoaderComponent data-testid="loading-spinner" />;
};
