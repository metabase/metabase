import styled from "@emotion/styled";

export const OuterCircle = styled.div`
  position: absolute;
  top: 4px;
  left: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--mb-color-border);
  transition: all 0.2s;
`;

export const InnerCircle = styled.div<{ isVisible: boolean }>`
  position: absolute;
  top: 4px;
  left: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  color-adjust: exact;
  background-color: ${props =>
    props.isVisible ? props.color : "var(--mb-color-background)"};
  border: 2px solid
    ${props => (props.isVisible ? props.color : "var(--mb-color-border)")};
  transition: all 0.2s;
`;

export const Button = styled.button`
  position: relative;
  width: 20px;
  height: 20px;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};

  &:hover,
  &:focus {
    ${InnerCircle} {
      transform: scale(0.8);
      border-width: 0;
    }
    ${OuterCircle} {
      transform: scale(1.3);
    }
  }
`;
