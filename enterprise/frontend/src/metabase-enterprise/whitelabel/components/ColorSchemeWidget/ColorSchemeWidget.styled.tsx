import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SettingSection = styled.div`
  &:last-of-type {
    margin-top: 2rem;
  }
`;

export const SettingTitle = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: 1rem;
`;
