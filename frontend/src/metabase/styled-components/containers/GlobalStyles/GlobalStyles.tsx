import { css, Global } from "@emotion/react";

import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
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
      --mb-color-success: ${color("success")};
      --mb-color-summarize: ${color("summarize")};
      --mb-color-text-dark: ${color("text-dark")};
      --mb-color-text-light: ${color("text-light")};
      --mb-color-text-medium: ${color("text-medium")};
      --mb-color-text-white: ${color("text-white")};
      --mb-color-warning: ${color("warning")};
      --mb-color-border-alpha-30: color-mix(
        in srgb,
        var(--mb-color-border) 30%,
        transparent
      );
      --mb-color-text-light-alpha-86: color-mix(
        in srgb,
        var(--mb-color-text-white) 86%,
        transparent
      );
      --mb-color-bg-black-alpha-60: color-mix(
        in srgb,
        var(--mb-color-bg-black) 60%,
        transparent
      );
      --mb-color-bg-white-alpha-15: color-mix(
        in srgb,
        var(--mb-color-bg-white) 15%,
        transparent
      );

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
      ${rootStyle}
    }

    ${baseStyle}
  `;

  return <Global styles={styles} />;
};
