import { useElementSize } from "@mantine/hooks";

import { getDefaultVizHeight } from "embedding-sdk/lib/default-height";

export const useSdkElementSize = (display?: string) => {
  const { height, ref, width } = useElementSize();

  // Some of our components by default don't have a specified height (i.e. the Visualization component)
  // and are rendering with a height of 0. This is a workaround to set a default height for those components.
  const elementHeight = height || (display && getDefaultVizHeight(display));

  return { height: elementHeight, ref, width };
};
