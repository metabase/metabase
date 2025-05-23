// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const DeleteMappingButton = styled(IconButtonWrapper)`
  color: var(--mb-color-text-dark);

  &:hover {
    color: var(--mb-color-danger);
  }
`;
