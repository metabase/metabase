import styled from "@emotion/styled";

import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { APP_SUBHEADER_HEIGHT } from "metabase/nav/constants";
import { breakpointMaxSmall, space } from "metabase/styled-components/theme";
import { type ButtonProps, Button as MantineButton } from "metabase/ui";

import RunButtonWithTooltip from "../../RunButtonWithTooltip";
import ViewSection, { ViewSubHeading } from "../ViewSection";

import { QuestionDataSource } from "./components/QuestionDataSource";

export const ViewHeaderContainer = styled(ViewSection)<{
  isNavBarOpen?: boolean;
}>`
  border-bottom: 1px solid var(--mb-color-border);
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: start;
    padding: ${space(1)} 0;
    ${({ isNavBarOpen }) =>
      isNavBarOpen ? `margin-top: ${APP_SUBHEADER_HEIGHT};` : null}
  }
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

export const SaveButton = styled(MantineButton)<ButtonProps>`
  border-radius: 8px;

  &[data-disabled="true"] {
    pointer-events: all;
  }

  :hover {
    background-color: var(--mb-color-bg-light);
  }
`;

export const SavedQuestionHeaderButtonContainer = styled.div<{
  isModelOrMetric: boolean;
}>`
  right: ${props => (props.isModelOrMetric ? "0px" : "0.38rem")};
`;

export const StyledLastEditInfoLabel = styled(LastEditInfoLabel)`
  color: var(--mb-color-text-light);

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

export const SavedQuestionLeftSideRoot = styled.div<{
  showSubHeader: boolean;
}>`
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
      top: 0;
    }

    ${ViewHeaderLeftSubHeading} {
      opacity: 1;
    }
  }

  ${breakpointMaxSmall} {
    padding: 0 1.25rem;

    ${SavedQuestionHeaderButtonContainer} {
      top: 0;
    }

    ${ViewHeaderLeftSubHeading} {
      opacity: 1;
    }
  }
`;

export const ViewHeaderActionPanel = styled.div`
  display: flex;
  align-items: center;
  margin-left: auto;
  gap: 0.5rem;

  ${breakpointMaxSmall} {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
    border-top: 1px solid var(--mb-color-border);
    margin-top: 1rem;
    padding: 0.5rem 2.5rem 0 2rem;
  }
`;

export const ViewHeaderIconButtonContainer = styled.div`
  ${Button.Root} {
    padding: 0.25rem 0.5rem;
    height: 2rem;
    width: 2rem;

    &:hover {
      color: var(--mb-color-brand);
      background-color: var(--mb-color-bg-medium);
    }
  }
`;

interface ViewRunButtonWithTooltipProps {
  isDirty: boolean;
}

export const ViewRunButtonWithTooltip = styled(
  RunButtonWithTooltip,
)<ViewRunButtonWithTooltipProps>`
  color: var(--mb-color-text-dark);

  &:hover {
    color: ${props => (props.isDirty ? color("text-white") : color("brand"))};
  }
`;
