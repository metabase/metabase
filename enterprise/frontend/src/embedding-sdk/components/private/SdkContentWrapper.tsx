import styled from "@emotion/styled";

import { baseStyle, getRootStyle } from "metabase/css/core/base.styled";
import { alpha, color } from "metabase/lib/colors";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

export const SdkContentWrapper = styled.div<{ font: string }>`
  --default-font-family: "${({ font }) => font}";
  --color-brand: ${color("brand")};
  --color-brand-alpha-04: ${alpha("brand", 0.04)};
  --color-brand-alpha-88: ${alpha("brand", 0.88)};
  --color-focus: ${color("focus")};

  ${aceEditorStyles}
  ${saveDomImageStyles}
  ${({ theme }) => getRootStyle(theme)}
  ${baseStyle}


  svg {
    display: inline;
  }
`;
