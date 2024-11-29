import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const FunctionHelpCodeArgument = styled.span`
  color: ${() => color("accent3")};
`;

export const ArgumentTitle = styled.div`
  color: ${() => color("accent3")};
  font-family: Monaco, monospace;
  font-size: 0.8125rem;
  text-align: right;
`;
