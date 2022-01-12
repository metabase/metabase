import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const WarningRoot = styled.div`
  margin-bottom: 2rem;
  padding: 1rem 0.75rem;
  border: 1px solid ${color("bg-medium")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
`;

export const WarningLink = styled.span`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
`;
