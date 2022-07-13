import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ToggleRoot = styled.div`
  display: flex;
  align-items: stretch;
  max-width: 33.125rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
`;

export const ImageContainer = styled.div`
  padding: 0.5rem 1rem 0.75rem 1.25rem;
  border-right: 1px solid ${color("border")};
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 2rem 1.5rem;
`;

export const ToggleLabel = styled.label`
  margin-right: 2rem;
`;
