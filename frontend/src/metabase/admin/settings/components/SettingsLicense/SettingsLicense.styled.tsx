import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SectionHeader = styled.h4`
  display: block;
  color: ${color("text-medium")};
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 8px;

  &:not(:first-of-type) {
    margin-top: 40px;
  }
`;

export const SectionDescription = styled.p`
  color: ${color("text-medium")};
  margin-top: 8px;
  margin-bottom: 16px;
  line-height: 1.7em;
`;

export const SubHeader = styled.h4`
  margin-top: 32px;
`;

interface ExplorePaidPlansContainerProps {
  justifyContent?: string;
}

export const ExplorePaidPlansContainer = styled.div<ExplorePaidPlansContainerProps>`
  margin: 16px 0;
  display: flex;
  align-items: flex-start;
  justify-content: ${props => props.justifyContent ?? "space-between"};
  border-bottom: 1px solid ${color("border")};
`;

export const SettingsLicenseContainer = styled.div`
  width: 580px;
  padding: 0 16px;
`;

export const LoaderContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;
