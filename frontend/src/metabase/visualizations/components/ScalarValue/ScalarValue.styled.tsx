import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

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
  fontSize: string;
}

export const ScalarValueWrapper = styled.h1<ScalarValueWrapperProps>`
  display: inline;
  font-size: ${props => props.fontSize};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

interface ScalarTitleContainerProps {
  lines: number;
}

export const ScalarTitleContainer = styled.div<ScalarTitleContainerProps>`
  line-height: ${TITLE_LINE_HEIGHT_REM}rem;
  max-height: ${props => props.lines * TITLE_LINE_HEIGHT_REM}rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0 ${space(1)};
  width: 100%;
`;

export const ScalarTitleContent = styled.h3`
  text-align: center;
  overflow: hidden;
  cursor: ${props => props.onClick && "pointer"};
  font-size: 14px;

  &:hover {
    color: ${color("brand")};
  }
`;

export const ScalarDescriptionContainer = styled.div`
  width: 1.5rem;
  margin-top: 0.2rem;
  padding-left: 0.5rem;
`;

export const ScalarDescriptionPlaceholder = styled.div`
  width: 1.5rem;
  margin-top: 0.2rem;
  padding-right: 0.5rem;
`;

export const ScalarDescriptionIcon = styled(Icon)`
  cursor: pointer;
  color: ${color("text-light")};

  &:hover {
    color: ${color("brand")};
  }
`;
