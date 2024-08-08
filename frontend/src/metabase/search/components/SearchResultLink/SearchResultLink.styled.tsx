import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { TextProps, AnchorProps } from "metabase/ui";
import { Group } from "metabase/ui";

type ResultLinkProps = AnchorProps | TextProps;

export const ResultLink = styled.a<ResultLinkProps>`
  line-height: unset;
  ${({ theme, href }) => {
    return (
      href &&
      css`
        &:hover,
        &:focus,
        &:focus-within {
          color: ${theme.fn.themeColor("brand")};
          outline: 0;
        }
      `
    );
  }};
  transition: color 0.2s ease-in-out;
`;

export const ResultLinkWrapper = styled(Group)`
  overflow: hidden;
`;
