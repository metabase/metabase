import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";

import { color, alpha } from "metabase/lib/colors";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";
import ViewSection, { ViewSubHeading, ViewHeading } from "./ViewSection";
import QuestionDataSource from "./QuestionDataSource";
import SavedQuestionHeaderButton from "../SavedQuestionHeaderButton/SavedQuestionHeaderButton";

export const ViewHeaderContainer = styled(ViewSection)`
  border-bottom: 1px solid ${color("border")};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};
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

  margin-left: 0.5rem;
  border-left: 1px solid ${color("border")};

  :hover {
    background-color: ${color("bg-light")};
  }
`;

export const SavedQuestionHeaderButtonContainer = styled.div`
  position: relative;
  right: 0.38rem;
`;

export const HeaderButton = styled(Button)`
  font-size: 0.875rem;
  background-color: ${({ active, color = getDefaultColor() }) =>
    active ? alpha(color, 0.8) : "transparent"};
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
  padding: ${space(2)} ${space(3)} ${space(1)} ${space(3)};
`;

export const ViewSubHeaderRoot = styled(ViewSection)`
  padding-top: 0.5rem;
`;

export const StyledLastEditInfoLabel = styled(LastEditInfoLabel)`
  color: ${color("text-light")};
  margin-left: 4px;

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

export const SavedQuestionLeftSideRoot = styled.div`
  ${SavedQuestionHeaderButton.Root} {
    transition: all 400ms ease;
    position: relative;
    top: ${props => (props.showSubHeader ? "0" : "10px")};
  }

  ${ViewHeaderLeftSubHeading} {
    opacity: ${props => (props.showSubHeader ? "1" : "0")};
    transition: all 400ms ease;
  }

  &:hover,
  &:focus-within {
    ${SavedQuestionHeaderButton.Root} {
      top: 0px;
    }

    ${ViewHeaderLeftSubHeading} {
      opacity: 1;
    }
  }
`;
