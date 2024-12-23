import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const ToastRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const StyledIcon = styled(Icon)`
  color: var(--mb-color-text-white);
  margin-right: ${space(1)};
`;

export const DestinationLink = styled(Link)`
  color: var(--mb-color-brand);
  margin-left: ${space(0)};
`;
