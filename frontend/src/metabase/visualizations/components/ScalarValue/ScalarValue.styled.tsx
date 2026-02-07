// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

const TITLE_LINE_HEIGHT_REM = 1.4;

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
}

export const ScalarValueWrapper = styled.h1<ScalarValueWrapperProps>`
  display: inline;
  margin: 0;
  font-size: ${(props) => props.fontSize};
  line-height: ${(props) => props.lineHeight ?? "var(--mantine-line-height)"};
  cursor: pointer;
  color: ${({ color }) => color};

  &:hover {
    color: var(--mb-color-brand);
  }
`;

interface ScalarTitleContainerProps {
  lines: number;
}

export const ScalarTitleContainer = styled.div<ScalarTitleContainerProps>`
  line-height: ${TITLE_LINE_HEIGHT_REM}rem;
  max-height: ${(props) => props.lines * TITLE_LINE_HEIGHT_REM}rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0 var(--mantine-spacing-sm);
  width: 100%;
`;
