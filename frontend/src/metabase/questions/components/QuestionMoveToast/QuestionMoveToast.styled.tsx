import styled from "@emotion/styled";

import Collections from "metabase/entities/collections";
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

export const CollectionLink = styled(Collections.Link)`
  color: var(--mb-color-brand);
  margin-left: ${space(0)};
`;
