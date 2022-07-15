import styled from "@emotion/styled";
import { css } from "@emotion/react";

import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import Button from "metabase/core/components/Button";

import { color } from "metabase/lib/colors";
import {
  breakpointMaxSmall,
  breakpointMinSmall,
  breakpointMaxMedium,
} from "metabase/styled-components/theme";
import EditableText from "metabase/core/components/EditableText";
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";

interface TypeForItemsThatRespondToNavBarOpen {
  isNavBarOpen: boolean;
}

export const HeaderRoot = styled(
  FullWidthContainer,
)<TypeForItemsThatRespondToNavBarOpen>`
  display: flex;
  align-items: center;

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
    padding-left: 0px;
    padding-right: 0px;
  }
`;

export const HeaderCaptionContainer = styled.div`
  position: relative;
  transition: top 400ms ease;
  display: flex;
  padding-right: 2rem;
  right: 0.25rem;
`;

export const HeaderCaption = styled(EditableText)`
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
`;

export const HeaderBadges = styled.div`
  display: flex;
  align-items: center;
  padding-left: 0.25rem;
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

interface HeaderContentProps {
  showSubHeader: boolean;
}

export const HeaderContent = styled.div<HeaderContentProps>`
  padding: 1rem 0;

  ${HeaderCaptionContainer} {
    top: ${props => (props.showSubHeader ? "0px" : "10px")};
  }
  ${HeaderLastEditInfoLabel} {
    opacity: ${props => (props.showSubHeader ? "1x" : "0")};
  }

  &:hover,
  &:focus-within {
    ${HeaderCaptionContainer} {
      top: 0px;
    }
    ${HeaderLastEditInfoLabel} {
      opacity: 1;
    }
  }

  ${breakpointMaxSmall} {
    padding-top: 0;
    padding-left: 1rem;
    padding-right: 1rem;

    ${HeaderCaptionContainer} {
      top: 0px;
    }
    ${HeaderLastEditInfoLabel} {
      opacity: 1;
    }
  }
`;

export const HeaderBadgesDivider = styled.span`
  color: ${color("text-light")};
  font-size: 0.8em;

  margin-left: 0.5rem;
  margin-right: 0.5rem;

  ${breakpointMaxSmall} {
    display: none;
  }
`;

export const HeaderButtonsContainer = styled.div<TypeForItemsThatRespondToNavBarOpen>`
  display: flex;
  align-items: center;
  color: ${color("text-dark")};
  margin-right: -1rem;

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
