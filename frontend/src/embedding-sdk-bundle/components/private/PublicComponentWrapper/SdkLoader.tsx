import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import { Center, Loader } from "metabase/ui";

export const SdkLoader = ({ className, style }: CommonStylingProps) => {
  return (
    <Center className={className} style={style} h="100%" w="100%" mx="auto">
      <Loader data-testid="loading-indicator" />
    </Center>
  );
};
