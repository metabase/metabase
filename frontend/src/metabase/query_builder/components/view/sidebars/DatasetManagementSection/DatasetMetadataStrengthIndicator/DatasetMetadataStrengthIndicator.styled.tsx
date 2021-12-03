import styled from "styled-components";

export const PercentageLabel = styled.span`
  position: absolute;
  left: 30%;
  top: -1rem;

  font-size: 0.8rem;
  font-weight: bold;
  color: ${props => props.color};

  opacity: 0;
  transform: translateY(80%);
  transition: all 0.4s;
`;

export const Root = styled.div`
  display: flex;
  flex: 1;
  position: relative;
  flex-direction: column;

  &:hover {
    ${PercentageLabel} {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
