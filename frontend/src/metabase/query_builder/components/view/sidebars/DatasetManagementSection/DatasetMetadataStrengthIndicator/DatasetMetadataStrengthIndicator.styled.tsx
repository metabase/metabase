import styled from "@emotion/styled";

export const TooltipParagraph = styled.p`
  margin: 0;
`;

export const TooltipContent = styled.div`
  ${TooltipParagraph}:last-child {
    margin-top: 1em;
  }
`;
