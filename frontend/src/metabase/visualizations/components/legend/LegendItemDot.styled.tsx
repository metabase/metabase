// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const OuterCircle = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 50%;
  background-color: var(--mb-color-border);
  transition: all 0.2s;
`;

export const InnerCircle = styled.div<{ isVisible: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 50%;
  color-adjust: exact;
  background-color: ${(props) =>
    props.isVisible ? props.color : "var(--mb-color-background-primary)"};
  border: 2px solid
    ${(props) =>
      props.isVisible ? props.color : "var(--mb-color-text-tertiary)"};
  transition: all 0.2s;
`;

export const Root = styled.div`
  position: relative;
`;

export const RootButton = styled.button`
  position: relative;
  cursor: pointer;

  &:hover {
    ${InnerCircle} {
      transform: scale(0.8);
    }
    ${OuterCircle} {
      transform: scale(1.3);
    }
  }
`;
