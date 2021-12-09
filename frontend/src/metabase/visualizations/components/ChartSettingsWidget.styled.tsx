import styled, { css } from "styled-components";

export const Root = styled.div<{
  disabled?: boolean;
  noPadding?: boolean;
}>`
  ${props =>
    !props.noPadding &&
    css`
      margin-left: 2em;
      margin-right: 2em;
    `}

  ${props =>
    props.hidden &&
    css`
      display: none;
    `}

  ${props =>
    !props.hidden &&
    css`
      margin-bottom: 1.5em;
    `}

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `}
`;

export const Title = styled.h4`
  display: flex;
  align-items: center;
  margin-bottom: 0.5em;
`;

export const Description = styled.span`
  margin-bottom: 0.5em;
`;

export const InfoIconContainer = styled.div`
  display: flex;
  margin-left: 0.5em;
`;
