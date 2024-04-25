import styled from "@emotion/styled";

import Collections from "metabase/entities/collections";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const ToastRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const StyledIcon = styled(Icon)`
  color: ${color("text-white")};
  margin-right: ${space(1)};
`;

export const CollectionLink = styled(Collections.Link)`
  color: ${color("brand")};
  margin-left: ${space(0)};
`;
