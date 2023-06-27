import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";

export interface ErrorMessageRootProps {
  inline?: boolean;
}

export const ErrorMessageRoot = styled.div<ErrorMessageRootProps>`
  color: ${color("error")};
  margin-top: ${props => !props.inline && "1rem"};
`;
