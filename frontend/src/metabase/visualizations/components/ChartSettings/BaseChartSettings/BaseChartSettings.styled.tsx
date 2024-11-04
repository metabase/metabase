import styled from "@emotion/styled";

import Radio from "metabase/core/components/Radio";

export const SectionContainer = styled.div`
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

export const ChartSettingsMenu = styled.div`
  flex: 1 0 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

export const ChartSettingsListContainer = styled.div`
  position: relative;
  padding: 1.5rem 0;
`;
