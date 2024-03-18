import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon, TextInput } from "metabase/ui";

export const TextInputTrirgger = styled(TextInput)`
  cursor: pointer;
  input {
    cursor: pointer;
  }
`;

export const TextInputIcon = styled(Icon)`
  cursor: pointer;
  color: ${color("text-dark")};
`;
