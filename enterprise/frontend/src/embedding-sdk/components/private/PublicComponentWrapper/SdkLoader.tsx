import { useSdkSelector } from "embedding-sdk/store";
import { getLoaderComponent } from "embedding-sdk/store/selectors";
import type { CommonStylingProps } from "embedding-sdk/types/props";
import { Center, Loader } from "metabase/ui";

export const SdkLoader = ({ className, style }: CommonStylingProps) => {
  const CustomLoader = useSdkSelector(getLoaderComponent);

  const LoaderComponent = CustomLoader || Loader;

  return (
    <Center className={className} style={style} h="100%" w="100%" mx="auto">
      <LoaderComponent data-testid="loading-indicator" />
    </Center>
  );
};
