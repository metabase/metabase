// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

const TITLE_LINE_HEIGHT_REM = 1.4;

interface ScalarRootProps {
  cardRowHeight?: number;
}

export const ScalarRoot = styled.div<ScalarRootProps>`
  position: relative;
  display: flex;
  flex: ${(props) => {
    if (
      props.cardRowHeight != null &&
      props.cardRowHeight >= 2 &&
      props.cardRowHeight <= 4
    ) {
      return "0.75 0 auto";
    }
    return "0.9 0 auto";
  }};
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 0;
`;

interface ScalarValueWrapperProps {
  fontSize?: string | number;
  lineHeight?: string;
}

export const ScalarValueWrapper = styled.h1<ScalarValueWrapperProps>`
  display: inline;
  font-size: ${(props) => props.fontSize};
  line-height: ${(props) => props.lineHeight ?? "1"};
  cursor: pointer;
  margin: 0;

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
