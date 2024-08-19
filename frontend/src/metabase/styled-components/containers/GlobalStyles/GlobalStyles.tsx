import { css, Global } from "@emotion/react";

import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { getSitePath } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { useMantineTheme } from "metabase/ui";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

import { getFont, getFontFiles } from "../../selectors";

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);

  const sitePath = getSitePath();
  const theme = useMantineTheme();

  const styles = css`
    ${getMetabaseCssVariables(theme)}
    :root {
      --mb-default-font-family: "${font}";
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
