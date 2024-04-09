import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const PreviewButton = styled(IconButtonWrapper)`
  margin-top: 1.5rem;
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const PreviewButtonIcon = styled(Icon)`
  width: 1.125rem;
  height: 1.125rem;
`;
