import { css, Global, useTheme } from "@emotion/react";

import { baseStyle, getRootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { alpha } from "metabase/lib/colors";
import { getSitePath } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getAceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

import { getFont, getFontFiles } from "../../selectors";

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);
  const theme = useTheme();

  const sitePath = getSitePath();

  const styles = css`
    :root {
      --mb-default-font-family: "${font}";
      --mb-color-brand: ${theme.fn.themeColor("brand")};
      --mb-color-brand-alpha-04: ${alpha(theme.fn.themeColor("brand"), 0.04)};
      --mb-color-brand-alpha-88: ${alpha(theme.fn.themeColor("brand"), 0.88)};
      --mb-color-focus: ${theme.fn.themeColor("focus")};
    }

    ${defaultFontFiles({ baseUrl: sitePath })}
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
    ${getAceEditorStyles(theme)};
    ${saveDomImageStyles}
    body {
      font-size: 0.875em;
      ${getRootStyle(theme)}
    }

    ${baseStyle}
  `;

  return <Global styles={styles} />;
};
