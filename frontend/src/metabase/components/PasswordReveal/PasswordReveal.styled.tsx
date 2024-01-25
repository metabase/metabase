import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { CopyButton } from "metabase/components/CopyButton";

export const PasswordCopyButton = styled(CopyButton)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
