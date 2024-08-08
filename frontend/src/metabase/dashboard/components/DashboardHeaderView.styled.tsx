import { css } from "@emotion/react";
import styled from "@emotion/styled";

import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import EditableText from "metabase/core/components/EditableText";
import { color } from "metabase/lib/colors";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  breakpointMaxMedium,
} from "metabase/styled-components/theme";

import { FixedWidthContainer } from "./Dashboard/Dashboard.styled";
import { SIDEBAR_WIDTH } from "./Sidebar";

interface TypeForItemsThatRespondToNavBarOpen {
  isNavBarOpen: boolean;
}

export const HeaderFixedWidthContainer = styled(
  FixedWidthContainer,
)<TypeForItemsThatRespondToNavBarOpen>`
  display: flex;
  align-items: center;
  justify-items: apart;

  ${breakpointMaxMedium} {
    ${props =>
      props.isNavBarOpen &&
      css`
        flex-direction: column;
        align-items: baseline;
      `}
  }

  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: baseline;
  }
`;

export const HeaderContainer = styled.div<{
  isSidebarOpen: boolean;
  isFixedWidth: boolean;
}>`
  ${props =>
    props.isFixedWidth &&
    props.isSidebarOpen &&
    css`
      margin-right: ${SIDEBAR_WIDTH}px;
    `}

  ${breakpointMaxMedium} {
    margin-right: 0;
  }
`;

export const HeaderRow = styled(FullWidthContainer)`
  ${breakpointMaxSmall} {
    padding-left: 0;
    padding-right: 0;
  }
`;

export const HeaderCaptionContainer = styled.div`
  position: relative;
  transition: top 400ms ease;
  padding-right: 2rem;
  right: 0.25rem;
  display: flex;
  align-items: center;
`;

export const HeaderCaption = styled(EditableText)`
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
`;

export const HeaderBadges = styled.div`
  display: flex;
  align-items: center;
  border-left: 1px solid transparent;

  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: baseline;
  }
`;

export const HeaderLastEditInfoLabel = styled(LastEditInfoLabel)`
  transition: opacity 400ms ease;
  ${breakpointMaxSmall} {
    margin-top: 4px;
  }
`;

export const EditWarning = styled.div`
  display: flex;
  align-items: center;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
`;

interface HeaderContentProps {
  showSubHeader: boolean;
  hasSubHeader: boolean;
}

export const HeaderContent = styled.div<HeaderContentProps>`
  padding-top: 1rem;
  padding-bottom: 0.75rem;

  ${HeaderCaptionContainer} {
    top: ${props => (props.showSubHeader ? "0px" : "10px")};
  }
  ${HeaderLastEditInfoLabel} {
    opacity: ${props => (props.showSubHeader ? "1x" : "0")};
  }

  ${({ hasSubHeader }) =>
    hasSubHeader &&
    css`
      &:hover,
      &:focus-within {
        ${HeaderCaptionContainer} {
          top: 0;
        }
        ${HeaderLastEditInfoLabel} {
          opacity: 1;
        }
      }
    `}

  ${breakpointMaxSmall} {
    padding-top: 0;
    padding-left: 1rem;
    padding-right: 1rem;

    ${HeaderCaptionContainer} {
      top: 0;
    }
    ${HeaderLastEditInfoLabel} {
      opacity: 1;
    }
  }
`;

export const HeaderButtonsContainer = styled.div<TypeForItemsThatRespondToNavBarOpen>`
  display: flex;
  align-items: center;
  color: ${color("text-dark")};

  ${breakpointMinSmall} {
    margin-left: auto;
  }

  ${breakpointMaxMedium} {
    ${props =>
      props.isNavBarOpen &&
      css`
        width: 100%;
        margin-bottom: 6px;
      `}
  }

  ${breakpointMaxSmall} {
    width: 100%;
    margin-bottom: 6px;
    padding-top: 0.375rem;
    padding-left: 1rem;
    padding-right: 1rem;
    border-top: 1px solid ${color("border")};
  }
`;

export const HeaderButtonSection = styled.div<TypeForItemsThatRespondToNavBarOpen>`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  ${breakpointMaxMedium} {
    ${props =>
      props.isNavBarOpen &&
      css`
        width: 100%;
        justify-content: space-between;
      `}
  }

  ${breakpointMaxSmall} {
    width: 100%;
    justify-content: space-between;
  }
`;
