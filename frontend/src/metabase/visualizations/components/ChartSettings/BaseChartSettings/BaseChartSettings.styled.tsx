// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Radio } from "metabase/common/components/Radio";

export const SectionContainer = styled.div`
  width: 100%;

  ${Radio.RadioGroupVariants.join(", ")} {
    padding-top: 1rem;
    padding-inline: 1.5rem;
    border-bottom: 1px solid var(--mb-color-border);
  }

  ${Radio.RadioContainerVariants.join(", ")} {
    padding-left: 1rem;
    padding-right: 1rem;
    padding-block: 0.5rem;
  }

  ${Radio.RadioLabelVariants.join(", ")} {
    /* flex-grow: 1; */
    margin-right: 0;
    display: flex;
    justify-content: center;

    &:not(:last-child) {
      margin-right: 0;
    }
  }
`;

export const ChartSettingsListContainer = styled.div`
  position: relative;
  padding: 1.5rem 0 0;
  flex: 1;
  overflow: auto;
`;
