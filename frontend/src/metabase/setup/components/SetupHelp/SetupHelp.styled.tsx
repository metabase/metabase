import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const SetupHelpRoot = styled.footer`
  color: ${color("text-medium")};
  padding: 1rem;
  margin-bottom: 2rem;
  border: 1px dashed ${color("border")}
  border-radius: 0.5rem;
`;
