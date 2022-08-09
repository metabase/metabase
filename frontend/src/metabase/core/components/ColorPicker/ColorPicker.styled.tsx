import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TriggerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 16.5rem;
  padding: 1rem;
`;

export const SaturationContainer = styled.div`
  position: relative;
  height: 10rem;
  margin-bottom: 1rem;
  border-radius: 0.25rem;
  overflow: hidden;
`;

export const HueContainer = styled.div`
  position: relative;
  height: 0.5rem;
  border-radius: 0.25rem;
  overflow: hidden;
`;

export const ControlsPointer = styled.div`
  border: 2px solid ${color("white")};
  border-radius: 50%;
  pointer-events: none;
`;

export const SaturationPointer = styled(ControlsPointer)`
  width: 0.875rem;
  height: 0.875rem;
  transform: translate(-50%, -50%);
`;

export const HuePointer = styled(ControlsPointer)`
  width: 0.625rem;
  height: 0.625rem;
  transform: translate(-50%, -0.0625rem);
`;
