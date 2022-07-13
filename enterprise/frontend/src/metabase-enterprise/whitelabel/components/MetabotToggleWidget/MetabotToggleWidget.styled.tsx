import styled from "@emotion/styled";
import { color, hueRotate } from "metabase/lib/colors";

export const MetabotSettingWidgetRoot = styled.div`
  max-width: 530px;
  border: 1px solid ${color("border")};
  display: flex;
  align-items: stretch;
  border-radius: 0.5rem;
`;

export const MetabotContainer = styled.div`
  padding: 0.5rem 1rem 0.75rem 1.25rem;
  border-right: 1px solid ${color("border")};
`;

export const MetabotImage = styled.img`
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;

export const ToggleContainer = styled.div`
  padding: 2rem 1.5rem;
  display: flex;
  align-items: center;
`;

export const ToggleLabel = styled.label`
  margin-right: 2rem;
`;
