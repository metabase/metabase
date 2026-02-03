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

import { getFont, getFontFiles } from "../../selectors";

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);
  const whitelabelColors = useSetting("application-colors");

  const sitePath = getSitePath();
  const theme = useMantineTheme();
  const { colorScheme } = theme.other;

  // This can get expensive so we should memoize it separately
  const cssVariables = useMemo(() => {
    return getMetabaseCssVariables({ theme, whitelabelColors });
  }, [theme, whitelabelColors]);

  const styles = useMemo(() => {
    return css`
      ${cssVariables}
      :root {
        --mb-default-font-family: "${font}";
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

      ${baseStyle}
    `;
  }, [cssVariables, font, sitePath, fontFiles, colorScheme]);

  return <Global styles={styles} />;
};
