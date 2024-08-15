import { useElementSize } from "@mantine/hooks";

export const useSdkElementSize = () => {
  const { height, ref, width } = useElementSize();

  return { height: height || (width ? width / 9 : 500), ref, width };
};
