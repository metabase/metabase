import { useMedia } from "react-use";

const useIsSmallScreen = () => {
  return useMedia("(max-width: 40em)");
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useIsSmallScreen;
