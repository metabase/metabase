// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/common/components/IconButtonWrapper";

export const DismissIconButtonWrapper = styled(IconButtonWrapper)`
  color: var(--mb-color-background-tertiary-inverse);

  &:hover {
    color: var(--mb-color-text-secondary);
  }
`;
