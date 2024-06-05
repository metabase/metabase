import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import { getRootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { alpha, color, lighten } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { aceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { getFontFiles } from "metabase/styled-components/selectors";
import { saveDomImageStyles } from "metabase/visualizations/lib/save-chart-image";
import type { FontFile } from "metabase-types/api";

interface SdkContentWrapperProps {
  baseUrl?: string;
}
export function SdkContentWrapper({
  baseUrl,
  ...divProps
}: SdkContentWrapperProps & HTMLAttributes<HTMLDivElement>) {
  const fontFiles = useSelector(getFontFiles);
  return (
    <SdkContentWrapperInner
      baseUrl={baseUrl}
      fontFiles={fontFiles}
      {...divProps}
    />
  );
}

const SdkContentWrapperInner = styled.div<
  SdkContentWrapperProps & {
    fontFiles: FontFile[] | null;
  }
>`
  --mb-default-font-family: "${({ theme }) => theme.fontFamily}";
  --mb-color-bg-light: ${({ theme }) => theme.fn.themeColor("bg-light")};
  --mb-color-bg-dark: ${({ theme }) => theme.fn.themeColor("bg-dark")};
  --mb-color-brand: ${({ theme }) => theme.fn.themeColor("brand")};
  --mb-color-brand-lighter: ${({ theme }) =>
    lighten(theme.fn.themeColor("brand"), 0.598)};
  --mb-color-brand-alpha-04: ${({ theme }) =>
    alpha(theme.fn.themeColor("brand"), 0.04)};
  --mb-color-brand-alpha-88: ${({ theme }) =>
    alpha(theme.fn.themeColor("brand"), 0.88)};
  --mb-color-focus: ${({ theme }) => theme.fn.themeColor("focus")};
  --mb-color-bg-white: ${({ theme }) => theme.fn.themeColor("bg-white")};
  --mb-color-bg-black: ${({ theme }) => theme.fn.themeColor("bg-black")};
  --mb-color-shadow: ${({ theme }) => theme.fn.themeColor("shadow")};
  --mb-color-border: ${({ theme }) => theme.fn.themeColor("border")};
  --mb-color-text-dark: ${({ theme }) => theme.fn.themeColor("text-dark")};
  --mb-color-text-medium: ${({ theme }) => theme.fn.themeColor("text-medium")};
  --mb-color-text-light: ${({ theme }) => theme.fn.themeColor("text-light")};
  --mb-color-bg-error: ${() => color("bg-error")};
  --mb-color-bg-medium: ${({ theme }) => theme.fn.themeColor("bg-medium")};
  --mb-color-bg-night: ${() => color("bg-night")};

  font-size: ${({ theme }) => theme.other.fontSize};

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

  :where(svg) {
    display: inline;
  }
`;
