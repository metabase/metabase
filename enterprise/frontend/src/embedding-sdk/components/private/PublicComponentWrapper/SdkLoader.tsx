import { useSdkSelector } from "embedding-sdk/store";
import { getLoaderComponent } from "embedding-sdk/store/selectors";
import { Loader, Center } from "metabase/ui";

export const SdkLoader = ({ className }: { className?: string }) => {
  const CustomLoader = useSdkSelector(getLoaderComponent);

  const LoaderComponent = CustomLoader || Loader;

  return (
    <Center className={className} h="100%" w="100%" mx="auto">
      <LoaderComponent data-testid="loading-indicator" />
    </Center>
  );
};
