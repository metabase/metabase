import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

export const EditIcon = styled(Icon)`
  color: ${color("brand")};
`;

export const ErrorIcon = styled(Icon)`
  color: ${color("error")};
`;

export const SuccessIcon = styled(Icon)`
  color: ${color("summarize")};
`;
