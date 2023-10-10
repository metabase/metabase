import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { TextProps, AnchorProps } from "metabase/ui";

type ResultLinkProps = AnchorProps | TextProps;

export const ResultLink = styled.a<ResultLinkProps>`
  ${({ theme, href }) => {
    return (
      href &&
      css`
        &:hover {
          color: ${theme.colors.brand[1]};
        }
      `
    );
  }};

  transition: color 0.2s ease-in-out;
`;
