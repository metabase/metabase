import { useElementSize } from "@mantine/hooks";

export const useSdkElementSize = () => {
  const { height, ref, width } = useElementSize();

  // Some of our components by default don't have a specified height (i.e. the Visualization component)
  // and are rendering with a height of 0. This is a workaround to set a default height for those components.
  const elementHeight = height || (width ? width / 9 : 500);

  return { height: elementHeight, ref, width };
};
