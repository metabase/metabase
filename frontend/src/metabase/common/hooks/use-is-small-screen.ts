import { useMedia } from "react-use";

export const useIsSmallScreen = () => {
  return useMedia("(max-width: 40em)");
};
