import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SettingRoot = styled.div`
  flex: 1 1 auto;
`;

export const SettingSection = styled.div`
  &:first-of-type {
    margin-top: 1rem;
  }

  &:last-of-type {
    margin-top: 2rem;
  }
`;

export const SettingTitle = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: 1rem;
`;
