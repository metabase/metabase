import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { useEmbeddingContext } from "./use-sdk-context";

export const useAvailableFonts = () => {
  const { font, setFont } = useEmbeddingContext();

  return {
    availableFonts: useSelector(state => getSetting(state, "available-fonts")),
    currentFont: font,
    setFont,
  };
};
