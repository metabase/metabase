import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface ErrorMessageRootProps {
  inline?: boolean;
}

export const ErrorMessageRoot = styled.div<ErrorMessageRootProps>`
  color: ${color("error")};
  margin-top: ${props => !props.inline && "1rem"};
`;
