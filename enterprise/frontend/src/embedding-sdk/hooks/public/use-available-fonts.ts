import { useEmbeddingContext } from "embedding-sdk/context";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import {getFontFiles} from "metabase/styled-components/selectors";

export const useAvailableFonts = () => {
  const { font, setFont } = useEmbeddingContext();
  return {
    availableFonts: useSelector(state => getSetting(state, "available-fonts")),
    fontFiles: useSelector(getFontFiles),
    currentFont: font,
    setFont,
  };
};
