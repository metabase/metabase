import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const ToastRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const StyledIcon = styled(Icon)`
  margin-right: ${space(1)};
`;
