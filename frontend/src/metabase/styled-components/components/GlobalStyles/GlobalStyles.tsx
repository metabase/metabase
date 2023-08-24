import { css, Global } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import type { FontFile } from "metabase-types/api";

export interface GlobalStylesProps {
  font: string;
  fontFiles: FontFile[] | null;
}

const GlobalStyles = ({ font, fontFiles }: GlobalStylesProps): JSX.Element => {
  const styles = css`
    :root {
      --default-font-family: "${font}";
      --color-brand: ${color("brand")};
      --color-brand-alpha-04: ${alpha("brand", 0.04)};
      --color-brand-alpha-88: ${alpha("brand", 0.88)};
      --color-focus: ${color("focus")};
    }

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
  `;

  return <Global styles={styles} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GlobalStyles;
