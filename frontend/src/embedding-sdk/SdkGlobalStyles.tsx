import { css, Global } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import { SDK_CONTEXT_CLASS_NAME } from "./config";

interface GlobalStylesProps {
  font: string;
}

export const SdkGlobalStyles = ({ font }: GlobalStylesProps): JSX.Element => {
  const styles = css`
    #${SDK_CONTEXT_CLASS_NAME} {
      --default-font-family: "${font}";
      --color-brand: ${color("brand")};
      --color-brand-alpha-04: ${alpha("brand", 0.04)};
      --color-brand-alpha-88: ${alpha("brand", 0.88)};
      --color-focus: ${color("focus")};

      ${aceEditorStyles}
      ${saveDomImageStyles}
    }
  `;

  return <Global styles={styles} />;
};
