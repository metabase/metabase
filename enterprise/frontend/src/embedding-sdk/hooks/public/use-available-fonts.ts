import { useEmbeddingContext } from "embedding-sdk/context";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const useAvailableFonts = () => {
  const { font, setFont } = useEmbeddingContext();
  return {
    availableFonts: useSelector(state => getSetting(state, "available-fonts")),
    currentFont: font,
    setFont,
  };
};
