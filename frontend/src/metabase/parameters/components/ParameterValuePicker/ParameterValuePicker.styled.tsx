import styled from "@emotion/styled";

import { Icon, TextInput } from "metabase/ui";

// TODO replace with Select without a dropdown? (metabase#40226)
export const TextInputTrirgger = styled(TextInput)`
  cursor: pointer;
  input {
    cursor: pointer;
  }
`;

export const PickerIcon = styled(Icon)`
  cursor: pointer;
  color: var(--mb-color-text-dark);
`;

export const ListPickerWrapper = styled.div`
  margin-top: -0.25rem;
`;
