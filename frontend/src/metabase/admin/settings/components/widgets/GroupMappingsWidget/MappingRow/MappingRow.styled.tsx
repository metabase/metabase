import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const DeleteMappingButton = styled(IconButtonWrapper)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("danger")};
  }
`;
