import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import Collections from "metabase/entities/collections";

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
