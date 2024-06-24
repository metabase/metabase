import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import { rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { useSelector } from "metabase/lib/redux";
import { getFontFiles } from "metabase/styled-components/selectors";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import type { FontFile } from "metabase-types/api";

interface SdkContentWrapperProps {
  baseUrl?: string;
}

export function SdkGlobalStylesWrapper({
  baseUrl,
  ...divProps
}: SdkContentWrapperProps & HTMLAttributes<HTMLDivElement>) {
  const fontFiles = useSelector(getFontFiles);

  return (
    <SdkGlobalStylesInner
      baseUrl={baseUrl}
      fontFiles={fontFiles}
      {...divProps}
    />
  );
}

const SdkGlobalStylesInner = styled.div<
  SdkContentWrapperProps & {
    fontFiles: FontFile[] | null;
  }
>`
  font-size: ${({ theme }) => theme.other.fontSize};

  ${({ theme }) => getMetabaseCssVariables(theme)}

  ${rootStyle}

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
`;
