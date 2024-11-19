import styled from "@emotion/styled";

export const PercentageLabel = styled.span`
  color: ${props => props.color};
  font-size: 0.8rem;
  font-weight: bold;
  user-select: none;
  transition: all 0.4s;
`;

export const Root = styled.div`
  display: inline-block;
  float: right;
`;

export const TooltipParagraph = styled.p`
  margin: 0;
`;

export const TooltipContent = styled.div`
  ${TooltipParagraph}:last-child {
    margin-top: 1em;
  }
`;
