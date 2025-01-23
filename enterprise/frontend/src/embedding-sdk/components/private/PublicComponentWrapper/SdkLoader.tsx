import { useSdkSelector } from "embedding-sdk/store";
import { getLoaderComponent } from "embedding-sdk/store/selectors";
import { LoaderTestId } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Loader } from "metabase/ui";

export const SdkLoader = ({ className }: { className?: string }) => {
  const CustomLoader = useSdkSelector(getLoaderComponent);

  const LoaderComponent = CustomLoader || Loader;

  return (
    <Center className={className} h="100%" w="100%" mx="auto">
      <LoaderTestId>
        <LoaderComponent />
      </LoaderTestId>
    </Center>
  );
};
