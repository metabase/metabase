import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const DismissIconButtonWrapper = styled(IconButtonWrapper)`
  color: var(--mb-color-bg-dark);

  &:hover {
    color: var(--mb-color-text-medium);
  }
`;
