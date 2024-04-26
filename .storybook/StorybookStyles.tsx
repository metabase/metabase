import { css, Global, useTheme } from "@emotion/react";

import { alpha, color } from "../frontend/src/metabase/lib/colors";
import { defaultFontFiles } from "../frontend/src/metabase/css/core/fonts.styled";
import { aceEditorStyles } from "../frontend/src/metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "../frontend/src/metabase/visualizations/lib/save-chart-image";
import {
  baseStyle,
  getRootStyle,
} from "../frontend/src/metabase/css/core/base.styled";
import { getSitePath } from "metabase/lib/dom";

export const StorybookStyles = (): JSX.Element => {
  const theme = useTheme();

  const baseUrl = "http://localhost:3000"

  const styles = css`
    :root {
      --mb-default-font-family: "Lato";
      --mb-color-brand: ${color("brand")};
      --mb-color-brand-alpha-04: ${alpha("brand", 0.04)};
      --mb-color-brand-alpha-88: ${alpha("brand", 0.88)};
      --mb-color-focus: ${color("focus")};
    }

    ${defaultFontFiles({ baseUrl })}
    ${aceEditorStyles}
      ${saveDomImageStyles}
      body {
      ${getRootStyle(theme)}
    }

    ${baseStyle}
  `;

  return <Global styles={styles} />;
};
