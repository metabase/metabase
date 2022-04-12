import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button/Button";

export const DangerButton = styled(Button)`
  color: ${color("danger")};
  padding-left: 0;
  padding-right: 0;

  &:hover {
    color: ${color("danger")};
    background-color: transparent;
  }
`;
