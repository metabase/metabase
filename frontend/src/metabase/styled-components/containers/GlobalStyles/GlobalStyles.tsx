// eslint-disable-next-line no-restricted-imports
import { Global, css } from "@emotion/react";
import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";
import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { getSitePath } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { useMantineTheme } from "metabase/ui";
import { saveDomImageStyles } from "metabase/visualizations/lib/image-exports";
import type { FontFile } from "metabase-types/api";

import { getFont, getFontFiles } from "../../selectors";

/**
 * Derive bold and heavy font weights from custom font files so the UI can
 * respect the font's actual weights instead of defaulting to 700/900.
 */
function getCustomFontWeightVariables(
  fontFiles: FontFile[] | null | undefined,
): { bold: number; heavy: number } {
  const defaultWeights = { bold: 700, heavy: 900 };
  if (!fontFiles?.length) {
    return defaultWeights;
  }
  const weights = [...new Set(fontFiles.map((f) => f.fontWeight))].sort(
    (a, b) => a - b,
  );
  if (weights.length === 1) {
    return { bold: weights[0], heavy: weights[0] };
  }
  if (weights.length === 2) {
    return { bold: weights[1], heavy: weights[1] };
  }
  return { bold: weights[1], heavy: weights[weights.length - 1] };
}

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);
  const whitelabelColors = useSetting("application-colors");

  const sitePath = getSitePath();
  const theme = useMantineTheme();
  const { colorScheme } = theme.other;

  const fontWeights = useMemo(
    () => getCustomFontWeightVariables(fontFiles),
    [fontFiles],
  );

  // This can get expensive so we should memoize it separately
  const cssVariables = useMemo(() => {
    return getMetabaseCssVariables({ theme, whitelabelColors });
  }, [theme, whitelabelColors]);

  const styles = useMemo(() => {
    return css`
      ${cssVariables}
      :root {
        --mb-default-font-family: "${font}";
        --mb-font-weight-bold: ${fontWeights.bold};
        --mb-font-weight-heavy: ${fontWeights.heavy};
      }

      ${defaultFontFiles({ baseUrl: sitePath })}
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
    ${saveDomImageStyles}
    body {
        font-size: 0.875em;
        ${isStaticEmbedding() || isPublicEmbedding()
          ? ""
          : `color-scheme: ${colorScheme};`}
        ${rootStyle}
      }

      /* Respect custom font weights for bold/heavy instead of defaulting to 700/900 */
      body b,
      body strong {
        font-weight: var(--mb-font-weight-bold) !important;
      }

      ${baseStyle}
    `;
  }, [cssVariables, font, sitePath, fontFiles, fontWeights, colorScheme]);

  return <Global styles={styles} />;
};
