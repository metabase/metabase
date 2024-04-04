import styled from "@emotion/styled";

import { FormSubmitButton } from "metabase/forms";
import { color, lighten } from "metabase/lib/colors";

export const StyledInvalidateNowButton = styled(FormSubmitButton)`
  align-self: flex-start;
  padding: 0.75rem;
  border: none;
  background-color: ${color("danger")};
  min-width: 40px;
  height: 40px;
  :hover {
    background-color: ${lighten("danger", 0.1)};
  }
  :disabled {
    background-color: ${lighten("danger", 0.1)};
  }
`;
