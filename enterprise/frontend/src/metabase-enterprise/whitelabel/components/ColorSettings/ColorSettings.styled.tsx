import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { breakpointMinLarge } from "metabase/styled-components/theme";

export const SettingRoot = styled.div`
  flex: 1 1 auto;
`;

export interface SettingTitleProps {
  hasDescription?: boolean;
}

export const SettingTitle = styled.div<SettingTitleProps>`
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: ${props => (props.hasDescription ? "0.5rem" : "1rem")};
`;

export const SettingDescription = styled.div`
  color: ${color("text-medium")};
  margin-bottom: 1rem;
`;

export const SectionContent = styled.div`
  display: flex;
  flex-direction: column;

  ${breakpointMinLarge} {
    flex-direction: row;
  }
`;

export const BrandColorSection = styled.div`
  margin-top: 1rem;
`;

export const ChartColorSection = styled.div`
  margin-top: 2rem;
`;
