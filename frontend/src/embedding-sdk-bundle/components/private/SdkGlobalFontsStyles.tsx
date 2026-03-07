// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global, css } from "@emotion/react";
import { useMemo } from "react";

import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { useSelector } from "metabase/lib/redux";
import { getFontFiles } from "metabase/styled-components/selectors";
import type { FontFile } from "metabase-types/api";

function getCustomFontWeightVariables(
  fontFiles: FontFile[] | null | undefined,
): { bold: number; heavy: number } {
  if (!fontFiles?.length) {
    return { bold: 700, heavy: 900 };
  }
  const weights = [...new Set(fontFiles.map((f) => f.fontWeight))].sort(
    (a, b) => a - b,
  );
  if (weights.length === 1) return { bold: weights[0], heavy: weights[0] };
  if (weights.length === 2) return { bold: weights[1], heavy: weights[1] };
  return { bold: weights[1], heavy: weights[weights.length - 1] };
}

/**
 * css style to define the font files for the SDK
 */
export const SdkFontsGlobalStyles = ({ baseUrl }: { baseUrl: string }) => {
  const fontFiles = useSelector(getFontFiles);
  const fontWeights = useMemo(
    () => getCustomFontWeightVariables(fontFiles),
    [fontFiles],
  );

  const fontStyles = useMemo(
    () => css`
      :root {
        --mb-font-weight-bold: ${fontWeights.bold};
        --mb-font-weight-heavy: ${fontWeights.heavy};
      }

      // built in fonts
      ${defaultFontFiles({ baseUrl })}

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
    [fontFiles, baseUrl, fontWeights],
  );

  return <Global styles={fontStyles} />;
};
