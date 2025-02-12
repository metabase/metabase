import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { lighten } from "metabase/lib/colors";

export const ExpandButton = styled(Button)`
  border: 1px solid
    ${({ theme }) => lighten(theme.fn?.themeColor("brand"), 0.3)};
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--mb-color-brand);
  margin-left: auto;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;
