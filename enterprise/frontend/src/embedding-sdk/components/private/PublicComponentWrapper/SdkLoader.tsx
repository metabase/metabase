// import { useSdkSelector } from "embedding-sdk/store";
// import { getLoaderComponent } from "embedding-sdk/store/selectors";
import { Loader } from "metabase/ui";

let SdkLoader = () => {
  // const CustomLoader = useSdkSelector(getLoaderComponent);

  // const LoaderComponent = CustomLoader || Loader;

  return <Loader data-testid="loading-spinner" />;
};

const setSdkLoaderComponent = (Component: (() => JSX.Element) | null) => {
  SdkLoader = Component ?? SdkLoader;
};

export { SdkLoader, setSdkLoaderComponent };
