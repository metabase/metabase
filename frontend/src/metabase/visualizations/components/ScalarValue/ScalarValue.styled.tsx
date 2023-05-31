import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

const TITLE_MAX_LINES = 2;
const TITLE_LINE_HEIGHT_REM = 1.4;

export const ScalarRoot = styled.div`
  // padding-top: ${((TITLE_MAX_LINES - 1) * TITLE_LINE_HEIGHT_REM) / 2}rem;
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
  fontSize: string;
}

export const ScalarValueWrapper = styled.h1<ScalarValueWrapperProps>`
  cursor: pointer;
  &:hover {
    color: ${color("brand")};
  }
  padding: 0 4px;

  font-size: ${props => props.fontSize};
`;

export const ScalarTitleContainer = styled.div`
  line-height: ${TITLE_LINE_HEIGHT_REM}rem;
  height: ${TITLE_LINE_HEIGHT_REM * TITLE_MAX_LINES}rem;
  display: flex;
  justify-content: center;
  padding: 0 1rem;
  width: 100%;
`;

export const ScalarTitleContent = styled.h3`
  text-align: center;
  overflow: hidden;
  cursor: ${props => props.onClick && "pointer"};

  &:hover {
    color: ${color("brand")};
  }
`;

export const ScalarDescriptionContainer = styled.div`
  cursor: pointer;
  width: 1.5rem;
  margin-top: 0.25rem;
  padding-left: 0.5rem;

  &:hover {
    color: ${color("brand")};
  }
`;

export const ScalarDescriptionPlaceholder = styled.div`
  width: 1.5rem;
`;
