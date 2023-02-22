import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const PulseHeader = styled.div`
  display: flex;
  margin: 2rem 0;
  padding: 1rem;
  align-items: start;
  border-radius: 0.5rem;
  background-color: ${color("bg-medium")};
`;

export const PulseHeaderContent = styled.div`
  margin-left: 0.5rem;
`;
