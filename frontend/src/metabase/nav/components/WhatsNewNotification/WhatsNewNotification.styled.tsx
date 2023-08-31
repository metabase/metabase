import styled from "@emotion/styled";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const DismissIconButtonWrapper = styled(IconButtonWrapper)`
  color: ${color("bg-dark")};

  &:hover {
    color: ${color("text-medium")};
  }
`;
