import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const SetupFooterRoot = styled.footer`
  color: ${color("text-medium")};
  padding: 1rem;
  margin-bottom: 2rem;
  border: 1px dashed ${color("border")};
  border-radius: 0.5rem;
  text-align: center;
`;
