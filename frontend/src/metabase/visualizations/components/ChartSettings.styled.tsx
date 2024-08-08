import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import { color } from "metabase/lib/colors";
import Warnings from "metabase/query_builder/components/Warnings";

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
    border-bottom: 1px solid ${color("border")};
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

export const SectionWarnings = styled(Warnings)`
  color: ${color("accent4")};
  position: absolute;
  top: 2rem;
  right: 2rem;
  z-index: 2;
`;

export const ChartSettingsRoot = styled.div`
  display: flex;
  flex-grow: 1;
  height: 100%;
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

export const ChartSettingsPreview = styled.div`
  flex: 2 0 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid ${color("border")};
  padding-top: 1.5rem;
`;

export const ChartSettingsVisualizationContainer = styled.div`
  position: relative;
  margin: 0 2rem;
  flex-grow: 1;
`;

export const ChartSettingsFooterRoot = styled.div`
  display: flex;
  justify-content: end;
  padding: 1rem 2rem;
  ${Button} {
    margin-left: 1rem;
  }
`;
