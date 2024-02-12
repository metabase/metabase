import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SettingRequiredLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.35rem;
  font-weight: 700;
  color: ${color("text-medium")};
  cursor: pointer;
`;
