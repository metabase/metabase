import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import { getRootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { alpha, color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { getFontFiles } from "metabase/styled-components/selectors";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import type { FontFile } from "metabase-types/api";

const SdkContentWrapperInner = styled.div<
  SdkContentWrapperProps & {
    fontFiles: FontFile[] | null;
  }
>`
  --mb-default-font-family: "${({ font }) => font}";
  --mb-color-brand: ${color("brand")};
  --mb-color-brand-alpha-04: ${alpha("brand", 0.04)};
  --mb-color-brand-alpha-88: ${alpha("brand", 0.88)};
  --mb-color-focus: ${color("focus")};

  ${aceEditorStyles}
  ${saveDomImageStyles}
  ${({ theme }) => getRootStyle(theme)}

  ${({ baseUrl }) => defaultFontFiles({ baseUrl })}
  ${({ fontFiles }) =>
    fontFiles?.map(
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

  svg {
    display: inline;
  }
`;
interface SdkContentWrapperProps {
  font: string;
  baseUrl?: string;
}
export function SdkContentWrapper({
  font,
  baseUrl,
  ...divProps
}: SdkContentWrapperProps & HTMLAttributes<HTMLDivElement>) {
  const fontFiles = useSelector(getFontFiles);
  return (
    <SdkContentWrapperInner
      font={font}
      baseUrl={baseUrl}
      fontFiles={fontFiles}
      {...divProps}
    />
  );
}
