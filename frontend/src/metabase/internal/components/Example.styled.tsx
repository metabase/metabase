import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ExampleRoot = styled.div`
  margin: 2px 0;
  width: 100%;
`;

export const ExampleContent = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${color("border")};
`;

export const ExampleFooter = styled.div`
  position: relative;
  padding: 1rem;
`;
