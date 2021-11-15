import styled from "styled-components";
import Link from "metabase/components/Link";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import ViewSection, { ViewSubHeading, ViewHeading } from "./ViewSection";

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

export const ViewSQLButtonContainer = styled.div`
  margin-left: ${space(2)};
  padding: ${space(1)};

  cursor: pointer;
  color: ${color("text-medium")};
  :hover {
    color: ${color("brand")};
  }
`;
