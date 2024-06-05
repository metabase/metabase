import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const DeleteMappingButton = styled(IconButtonWrapper)`
  color: var(--mb-color-text-dark);

  &:hover {
    color: ${color("danger")};
  }
`;
