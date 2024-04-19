import { css, Global, useTheme } from "@emotion/react";

import { baseStyle, getRootStyle } from "metabase/css/core/base.styled";
import { alpha, color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { defaultFontFiles } from "metabase/styled-components/fonts";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

import { getFont, getFontFiles } from "../../selectors";

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);
  const theme = useTheme();

  const styles = css`
    :root {
      --mb-default-font-family: "${font}";
      --mb-color-brand: ${color("brand")};
      --mb-color-brand-alpha-04: ${alpha("brand", 0.04)};
      --mb-color-brand-alpha-88: ${alpha("brand", 0.88)};
      --mb-color-focus: ${color("focus")};
    }

    ${defaultFontFiles()}
    ${fontFiles?.map(
            file => css`
              @font-face {
                font-family: "${font}";
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
      ${getRootStyle(theme)}
    }

    ${baseStyle}
  `;

  return <Global styles={styles} />;
};
