import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const RemoveButton = styled(IconButtonWrapper)`
  color: ${color("text-medium")};
  font-weight: bold;

  &:hover {
    color: ${color("error")};
  }
`;
