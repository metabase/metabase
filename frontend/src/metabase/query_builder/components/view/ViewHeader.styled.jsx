import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CollectionBadge from "metabase/questions/components/CollectionBadge";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";

import { color, alpha } from "metabase/lib/colors";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";
import ViewSection, { ViewSubHeading, ViewHeading } from "./ViewSection";
import QuestionDataSource from "./QuestionDataSource";

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

  &:not(:empty) {
    margin-top: ${space(0)};
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
  position: relative;
  right: 0.38rem;
`;

export const DatasetHeaderButtonContainer = styled.div`
  position: relative;
  right: 0.3rem;
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

export const StyledCollectionBadge = styled(CollectionBadge)`
  margin-bottom: 0.5rem;

  ${breakpointMaxSmall} {
    padding-right: 1rem;
  }
`;

export const StyledQuestionDataSource = styled(QuestionDataSource)`
  margin-bottom: 0.5rem;
  margin-left: 1.5rem;
  padding-right: 1rem;

  ${breakpointMaxSmall} {
    margin-left: 0;
    padding-right: 0;
  }
`;
