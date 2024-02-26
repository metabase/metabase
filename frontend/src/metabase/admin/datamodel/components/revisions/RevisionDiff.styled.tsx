import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const EditIcon = styled(Icon)`
  color: ${color("brand")};
`;

export const ErrorIcon = styled(Icon)`
  color: ${color("error")};
`;

export const SuccessIcon = styled(Icon)`
  color: ${color("summarize")};
`;
