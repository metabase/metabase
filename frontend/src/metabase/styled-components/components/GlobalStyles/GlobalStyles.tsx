import React from "react";
import { css, Global } from "@emotion/react";
import { FontFile } from "metabase-types/api";
import { saveChartImageStyles } from "metabase/visualizations/lib/save-chart-image";

export interface GlobalStylesProps {
  font: string;
  fontFiles: FontFile[] | null;
}

const GlobalStyles = ({ font, fontFiles }: GlobalStylesProps): JSX.Element => {
  const styles = css`
    :root {
      --default-font-family: "${font}";
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

    ${saveChartImageStyles}
  `;

  return <Global styles={styles} />;
};

export default GlobalStyles;
