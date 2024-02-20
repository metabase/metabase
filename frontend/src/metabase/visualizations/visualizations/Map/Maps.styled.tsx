import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const CustomMapContent = styled.div`
  border-top: 1px solid ${color("border")};
  padding: 0.75rem 1.5rem;
  justify-content: space-between;
  color: ${color("text-dark")};
  font-weight: 700;
  display: flex;
`;
