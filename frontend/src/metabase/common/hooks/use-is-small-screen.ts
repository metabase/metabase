import { useMedia } from "react-use";

const useIsSmallScreen = () => {
  return useMedia("(max-width: 40em)");
};

export { useIsSmallScreen };
