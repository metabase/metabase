import { Global, css } from "@emotion/react";
import { useMemo } from "react";
import { useSelector } from "react-redux";

import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { getFontFiles } from "metabase/styled-components/selectors";

/**
 * css style to define the font files for the SDK
 */
export const SdkFontsGlobalStyles = ({ baseUrl }: { baseUrl: string }) => {
  const fontFiles = useSelector(getFontFiles);

  const fontStyles = useMemo(
    () => css`
      // built in fonts
      ${defaultFontFiles({ baseUrl })}

      // custom fonts
      ${fontFiles?.map(
        file => css`
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
    [fontFiles, baseUrl],
  );

  return <Global styles={fontStyles} />;
};
