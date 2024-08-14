import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon } from "metabase/ui";

export const PreviewButton = styled(IconButtonWrapper)`
  margin-top: 1.5rem;
  color: var(--mb-color-text-dark);

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const PreviewButtonIcon = styled(Icon)`
  width: 1.125rem;
  height: 1.125rem;
`;
