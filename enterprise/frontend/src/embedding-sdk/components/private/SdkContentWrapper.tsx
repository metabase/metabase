import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { DEFAULT_FONT } from "embedding-sdk/config";
import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { getRootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { alpha, color } from "metabase/lib/colors";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";

export const SdkContentWrapper = styled.div<{ baseUrl?: string }>`
  --mb-default-font-family: "${({ theme }) => getFontFamily(theme)}";
  --mb-color-brand: ${color("brand")};
  --mb-color-brand-alpha-04: ${alpha("brand", 0.04)};
  --mb-color-brand-alpha-88: ${alpha("brand", 0.88)};
  --mb-color-focus: ${color("focus")};

  ${aceEditorStyles}
  ${saveDomImageStyles}
  ${({ theme }) => getRootStyle(theme)}
  ${({ theme }) => getWrapperStyle(theme)}

  ${({ baseUrl }) => defaultFontFiles({ baseUrl })}

  svg {
    display: inline;
  }
`;

const getFontFamily = (theme: EmbeddingTheme) =>
  theme.fontFamily ?? DEFAULT_FONT;

const getWrapperStyle = (theme: EmbeddingTheme) => css`
  font-size: ${theme.other.fontSize ?? "0.875em"};
`;
