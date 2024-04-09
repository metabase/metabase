import styled from "@emotion/styled";

import { CopyButton } from "metabase/components/CopyButton";
import { color } from "metabase/lib/colors";

export const PasswordCopyButton = styled(CopyButton)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
