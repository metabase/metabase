import { css, Global } from "@emotion/react";

import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import { FontFile } from "metabase-types/api";

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

    ${saveDomImageStyles}
  `;

  return <Global styles={styles} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GlobalStyles;
