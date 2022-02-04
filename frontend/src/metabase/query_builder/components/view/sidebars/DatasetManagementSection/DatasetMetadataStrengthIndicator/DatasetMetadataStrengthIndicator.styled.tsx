import styled from "styled-components";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

export const PercentageLabel = styled.span`
  position: absolute;

  top: -1rem;
  left: 50%;
  transform: translate(-50%, 60%);

  color: ${props => props.color};
  font-size: 0.8rem;
  font-weight: bold;
  user-select: none;

  opacity: 0;

  transition: all 0.4s;
`;

export const Root = forwardRefToInnerRef(styled.div<{ ref?: React.Ref<any> }>`
  display: flex;
  flex: 1;
  position: relative;
  flex-direction: column;

  &:hover {
    ${PercentageLabel} {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
`);

export const TooltipParagraph = styled.p`
  margin: 0;
`;

export const TooltipContent = styled.div`
  ${TooltipParagraph}:last-child {
    margin-top: 1em;
  }
`;
