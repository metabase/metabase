// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Link } from "metabase/common/components/Link";
import { Icon } from "metabase/ui";

export const ToastRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const StyledIcon = styled(Icon)`
  color: var(--mb-color-text-primary-inverse);
  margin-right: var(--mantine-spacing-sm);
`;

export const DestinationLink = styled(Link)`
  color: var(--mb-color-brand);
  margin-left: var(--mantine-spacing-xs);
`;
