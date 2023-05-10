import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const FlexContainer = styled.div`
  padding: 1rem 0;
  display: flex;
  gap: 2rem;
`;

export const SectionTitle = styled.h3`
  font-weight: bold;
  color: ${color("text-light")};
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
`;

export const ColorText = styled.div<{ color: string }>`
  margin-top: 1rem;
  color: ${props => color(props.color)};
`;

export const PaddedForm = styled.form`
  padding: 0 1rem;
`;
