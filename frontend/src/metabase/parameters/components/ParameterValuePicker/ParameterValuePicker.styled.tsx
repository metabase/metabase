import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon, TextInput } from "metabase/ui";

// TODO replace with Select without a dropdown?
export const TextInputTrirgger = styled(TextInput)`
  cursor: pointer;
  input {
    cursor: pointer;
  }
`;

export const PickerIcon = styled(Icon)`
  cursor: pointer;
  color: ${color("text-dark")};
`;
