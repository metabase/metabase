import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const DeleteMappingButton = styled(IconButtonWrapper)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("danger")};
  }
`;
