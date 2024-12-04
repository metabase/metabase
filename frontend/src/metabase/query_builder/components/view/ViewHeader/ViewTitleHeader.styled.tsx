import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

import { ViewSubHeading } from "../ViewSection";

export const ViewHeaderLeftSubHeading = styled(ViewSubHeading)`
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  @media screen and (max-width: 40em) {
    flex-direction: column;
    align-items: start;
  }
`;

export const SavedQuestionHeaderButtonContainer = styled.div<{
  isModelOrMetric: boolean;
}>`
  right: ${props => (props.isModelOrMetric ? "0px" : "0.38rem")};
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

  @media screen and (max-width: 40em) {
    padding: 0 1.25rem;

    ${SavedQuestionHeaderButtonContainer} {
      top: 0;
    }

    ${ViewHeaderLeftSubHeading} {
      opacity: 1;
    }
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
