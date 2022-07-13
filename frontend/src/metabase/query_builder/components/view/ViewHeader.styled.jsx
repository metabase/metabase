import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";

import { color, alpha } from "metabase/lib/colors";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";
import ViewSection, { ViewSubHeading, ViewHeading } from "./ViewSection";
import QuestionDataSource from "./QuestionDataSource";

export const ViewHeaderContainer = styled(ViewSection)`
  border-bottom: 1px solid ${color("border")};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: start;
    padding: ${space(1)} 0;
  }
`;

export const ViewHeaderMainLeftContentContainer = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
`;

export const ViewHeaderLeftSubHeading = styled(ViewSubHeading)`
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: start;
  }
`;

export const AdHocViewHeading = styled(ViewHeading)`
  margin-bottom: ${space(0)};
  margin-top: ${space(0)};
  margin-right: ${space(2)};
`;

export const SaveButton = styled(Link)`
  color: ${color("brand")};
  font-weight: bold;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  background-color: ${color("bg-white")};

  :hover {
    background-color: ${color("bg-light")};
  }
`;

export const SavedQuestionHeaderButtonContainer = styled.div`
  right: ${props => (props.isDataset ? "0px" : "0.38rem")};
`;

export const HeaderButton = styled(Button)`
  font-size: 0.875rem;
  background-color: ${({ active, color = getDefaultColor() }) =>
    active ? color : "transparent"};
  color: ${({ active }) => (active ? "white" : color("text-dark"))};
  &:hover {
    background-color: ${({ color = getDefaultColor() }) => alpha(color, 0.15)};
    color: ${color};
  }
  transition: background 300ms linear, border 300ms linear;
  > .Icon {
    opacity: 0.6;
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

export const IconHeaderButton = styled(HeaderButton)`
  padding-left: 0.75rem;
  padding-right: 0.75rem;
`;

export const FilterHeaderButton = styled(Button)`
  background-color: ${({ active }) =>
    active ? alpha(color("filter"), 0.8) : alpha(color("filter"), 0.2)};
  color: ${({ active }) => (active ? "white" : color("filter"))};
  border-radius: 99px;
  padding-top: ${space(0.5)};
  padding-bottom: ${space(0.5)};
  &:hover {
    background-color: ${color("filter")};
    color: white;
  }
  transition: background 300ms linear, border 300ms linear;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

const getDefaultColor = () => color("brand");

export const FilterHeaderContainer = styled.div`
  padding: ${space(1)} ${space(3)} 0 ${space(3)};
  border-bottom: 1px solid ${color("border")};
`;

export const ViewSubHeaderRoot = styled(ViewSection)`
  padding-top: 0.5rem;
`;

export const StyledLastEditInfoLabel = styled(LastEditInfoLabel)`
  color: ${color("text-light")};
  //margin-left: 4px;

  ${breakpointMaxSmall} {
    margin-left: 0;
    margin-top: 2px;
    margin-bottom: 4px;
  }
`;

export const StyledQuestionDataSource = styled(QuestionDataSource)`
  padding-right: 1rem;

  ${breakpointMaxSmall} {
    margin-left: 0;
    padding-right: 0;
  }
`;

export const AdHocLeftSideRoot = styled.div`
  ${breakpointMaxSmall} {
    padding: 0 1.25rem;
  }
`;

export const SavedQuestionLeftSideRoot = styled.div`
  ${SavedQuestionHeaderButtonContainer} {
    transition: all 400ms ease;
    position: relative;
    top: ${props => (props.showSubHeader ? "0" : "0.5rem")};
  }

  ${ViewHeaderLeftSubHeading} {
    opacity: ${props => (props.showSubHeader ? "1" : "0")};
    transition: all 400ms ease;
  }

  &:hover,
  &:focus-within {
    ${SavedQuestionHeaderButtonContainer} {
      top: 0px;
    }

    ${ViewHeaderLeftSubHeading} {
      opacity: 1;
    }
  }

  ${breakpointMaxSmall} {
    padding: 0 1.25rem;

    ${SavedQuestionHeaderButtonContainer} {
      top: 0px;
    }

    ${ViewHeaderLeftSubHeading} {
      opacity: 1;
    }
  }
`;

export const HeaderDivider = styled.span`
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: 700;
  color: ${color("text-medium")};
  padding-left: 0.5rem;
  padding-right: 0.25rem;
`;

export const ViewHeaderActionPanel = styled.div`
  display: flex;
  align-items: center;
  margin-left: auto;

  ${breakpointMaxSmall} {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
    border-top: 1px solid ${color("border")};
    margin-top: 1rem;
    padding: 0.5rem 2.5rem 0 2rem;
  }

  ${Button.Root} {
    margin-left: 0.5rem;
  }
`;
