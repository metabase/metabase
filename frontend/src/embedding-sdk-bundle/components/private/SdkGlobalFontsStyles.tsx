import "metabase/css/core/fonts.css";
import { useSelector } from "metabase/redux";
import { GlobalStyleSheet } from "metabase/styled-components/components/GlobalStyleSheet";
import { getFontFiles } from "metabase/styled-components/selectors";
import { getCustomFontFaceStyles } from "metabase/utils/fonts";

/**
 * css style to define the font files for the SDK
 */
export const SdkFontsGlobalStyles = () => {
  const fontFiles = useSelector(getFontFiles);

  const fontStyles = getCustomFontFaceStyles(fontFiles);

  return <GlobalStyleSheet styles={fontStyles} />;
};
