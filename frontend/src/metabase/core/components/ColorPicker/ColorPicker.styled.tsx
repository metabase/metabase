import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TriggerContainer = styled.div`
  display: flex;
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
`;

export const HueContainer = styled.div`
  position: relative;
  height: 0.625rem;
`;

export const SaturationPointer = styled.div`
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid ${color("white")};
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
`;
