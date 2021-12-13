import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const PageHeader = styled.header`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid ${color("border")};
`;

export const PageBody = styled.div`
  margin-top: 4rem;
  padding: 0 1em;
`;
