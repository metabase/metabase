import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SettingRoot = styled.div`
  flex: 1 1 auto;
`;

export const SettingTitle = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: 1rem;
`;

export const SectionContent = styled.div`
  display: flex;
`;

export const BrandColorSection = styled.div`
  margin-top: 1rem;
`;

export const ChartColorSection = styled.div`
  margin-top: 2rem;
`;
