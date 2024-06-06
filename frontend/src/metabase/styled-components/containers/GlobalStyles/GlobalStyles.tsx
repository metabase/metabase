import { css, Global, useTheme } from "@emotion/react";

import { baseStyle, getRootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { alpha, color, lighten } from "metabase/lib/colors";
import { getSitePath } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
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
      --mb-color-brand: ${color("brand")};
      --mb-color-brand-alpha-04: ${alpha("brand", 0.04)};
      --mb-color-brand-alpha-88: ${alpha("brand", 0.88)};
      --mb-color-brand-light: ${lighten("brand", 0.532)};
      --mb-color-brand-lighter: ${lighten("brand", 0.598)};
      --mb-color-focus: ${color("focus")};
      --mb-color-bg-dark: ${color("bg-dark")};
      --mb-color-bg-light: ${color("bg-light")};
      --mb-color-bg-medium: ${color("bg-medium")};
      --mb-color-bg-night: ${color("bg-night")};
      --mb-color-bg-white: ${color("bg-white")};
      --mb-color-border: ${color("border")};
      --mb-color-danger: ${color("danger")};
      --mb-color-error: ${color("error")};
      --mb-color-filter: ${color("filter")};
      --mb-color-shadow: ${color("shadow")};

      /*
        Theming-specific CSS variables.
        These CSS variables are not part of the core design system colors.
      **/
      --mb-color-bg-dashboard: var(--mb-color-bg-white);
      --mb-color-bg-dashboard-card: var(--mb-color-bg-white);
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
    ${aceEditorStyles}
    ${saveDomImageStyles}
    body {
      font-size: 0.875em;
      ${getRootStyle(theme)}
    }

    ${baseStyle}
  `;

  return <Global styles={styles} />;
};
