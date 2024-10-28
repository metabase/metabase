import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";

interface SectionContainerProps {
  isDashboard: boolean;
}

export const SectionContainer = styled.div<SectionContainerProps>`
  ${({ isDashboard }) =>
    isDashboard &&
    css`
      margin-top: 1rem;
    `}
  width: 100%;
  ${Radio.RadioGroupVariants.join(", ")} {
    border-bottom: 1px solid var(--mb-color-border);
  }
  ${Radio.RadioContainerVariants.join(", ")} {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  ${Radio.RadioLabelVariants.join(", ")} {
    flex-grow: 1;
    margin-right: 0;
    display: flex;
    justify-content: center;

    &:not(:last-child) {
      margin-right: 0;
    }
  }
`;
