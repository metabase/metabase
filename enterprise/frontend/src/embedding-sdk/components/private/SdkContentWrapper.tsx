import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { EmbeddingTheme } from "embedding-sdk/types/theme/private";
import { getRootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { alpha } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getAceEditorStyles } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
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
  --mb-color-brand: ${({ theme }) => theme.fn.themeColor("brand")};
  --mb-color-brand-alpha-04: ${({ theme }) =>
    alpha(theme.fn.themeColor("brand"), 0.04)};
  --mb-color-brand-alpha-88: ${({ theme }) =>
    alpha(theme.fn.themeColor("brand"), 0.88)};
  --mb-color-focus: ${({ theme }) => theme.fn.themeColor("focus")};
  --mb-color-bg-white: ${({ theme }) => theme.fn.themeColor("bg-white")};
  --mb-color-bg-black: ${({ theme }) => theme.fn.themeColor("bg-black")};
  --mb-color-bg-light: ${({ theme }) => theme.fn.themeColor("bg-light")};
  --mb-color-bg-dark: ${({ theme }) => theme.fn.themeColor("bg-dark")};
  --mb-color-bg-medium: ${({ theme }) => theme.fn.themeColor("bg-medium")};
  --mb-color-shadow: ${({ theme }) => theme.fn.themeColor("shadow")};
  --mb-color-border: ${({ theme }) => theme.fn.themeColor("border")};
  --mb-color-black: ${({ theme }) => theme.fn.themeColor("black")};
  --mb-color-text-white: ${({ theme }) => theme.fn.themeColor("text-white")};
  --mb-color-text-dark: ${({ theme }) => theme.fn.themeColor("text-dark")};
  --mb-color-text-medium: ${({ theme }) => theme.fn.themeColor("text-medium")};
  --mb-color-text-light: ${({ theme }) => theme.fn.themeColor("text-light")};
  --mb-color-white: ${({ theme }) => theme.fn.themeColor("white")};

  // TODO:
  --mb-color-brand-light: ${({ theme }) => theme.fn.themeColor("brand-light")};
  //--mb-color-bg-error
  //--mb-color-brand-lighter
  //--mb-color-danger
  //--mb-color-dark
  //--mb-color-error
  //--mb-color-filter
  //--mb-color-success
  //--mb-color-summarize
  //--mb-color-text-brand
  //--mb-color-warning

  ${({ theme }) => getAceEditorStyles(theme)}
  ${saveDomImageStyles}
  ${({ theme }) => getRootStyle(theme)}
  ${({ theme }) => getWrapperStyle(theme)}

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

const getWrapperStyle = (theme: EmbeddingTheme) => css`
  font-size: ${theme.other.fontSize ?? "0.875em"};
`;
