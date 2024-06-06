import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EditIcon = styled(Icon)`
  color: var(--mb-color-brand);
`;

export const ErrorIcon = styled(Icon)`
  color: var(--mb-color-error);
`;

export const SuccessIcon = styled(Icon)`
  color: ${color("summarize")};
`;
