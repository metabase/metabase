import { type JSX, useMemo } from "react";

import "metabase/css/core/base.css";
import "metabase/css/core/fonts.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { GlobalStyleSheet } from "metabase/styled-components/components/GlobalStyleSheet";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { useMantineTheme } from "metabase/ui";
import { getFontFamilyValue } from "metabase/utils/fonts";
import { getSaveDomImageStyles } from "metabase/viz-core";

import { getFont, getFontFiles } from "../../selectors";

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);
  const whitelabelColors = useSetting("application-colors");

  const theme = useMantineTheme();
  const { colorScheme } = theme.other;

  // This can get expensive so we should memoize it separately
  const cssVariables = useMemo(() => {
    return getMetabaseCssVariables({ theme, whitelabelColors });
  }, [theme, whitelabelColors]);

  const styles = useMemo(() => {
    const fontFaces = (fontFiles ?? [])
      .map(
        (file) => `
          @font-face {
            font-family: "Custom";
            src: url(${encodeURI(file.src)}) format("${file.fontFormat}");
            font-weight: ${file.fontWeight};
            font-style: normal;
            font-display: swap;
          }
        `,
      )
      .join("\n");

    return `
      ${cssVariables}
      :root {
        --mb-default-font-family: ${getFontFamilyValue(font)};
      }

      ${fontFaces}
      ${getSaveDomImageStyles(isEmbeddingSdk())}
      body {
        font-size: 0.875em;
        ${
          isStaticEmbedding() || isPublicEmbedding()
            ? ""
            : `color-scheme: ${colorScheme};`
        }
      }
    `;
  }, [cssVariables, font, fontFiles, colorScheme]);

  return <GlobalStyleSheet styles={styles} />;
};
