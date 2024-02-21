import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const DeleteMappingButton = styled(IconButtonWrapper)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("danger")};
  }
`;
