// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

export const ScalarRoot = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
`;

interface ScalarValueWrapperProps {
  fontSize?: string | number;
  lineHeight?: string;
  disableHover?: boolean;
}

export const ScalarValueWrapper = styled.h1<ScalarValueWrapperProps>`
  display: inline;
  font-size: ${(props) => props.fontSize};
  line-height: ${(props) => props.lineHeight ?? "var(--mantine-line-height)"};
  cursor: pointer;
  color: ${({ color }) => color};

  &:hover {
    color: ${({ disableHover }) =>
      disableHover ? undefined : "var(--mb-color-brand)"};
  }
`;
