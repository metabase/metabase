// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global, css } from "@emotion/react";
import { useMemo } from "react";

import "fonts.css";
import { useSelector } from "metabase/redux";
import { getFontFiles } from "metabase/styled-components/selectors";

/**
 * css style to define the font files for the SDK
 */
export const SdkFontsGlobalStyles = () => {
  const fontFiles = useSelector(getFontFiles);

  const fontStyles = useMemo(
    () => css`
      // custom fonts
      ${fontFiles?.map(
        (file) => css`
          @font-face {
            font-family: "Custom";
            src: url(${encodeURI(file.src)}) format("${file.fontFormat}");
            font-weight: ${file.fontWeight};
            font-style: normal;
            font-display: swap;
          }
        `,
      )}
    `,
    [fontFiles],
  );

  return <Global styles={fontStyles} />;
};
