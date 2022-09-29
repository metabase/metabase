import useMediaQuery from "metabase/hooks/use-media-query";

const useIsSmallScreen = () => {
  return useMediaQuery("(max-width: 40em)");
};

export default useIsSmallScreen;
