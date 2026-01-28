import styled from "@emotion/styled";

import { Button, type ButtonProps } from "metabase/common/components/Button";
import { color } from "metabase/ui/utils/colors";
import {
  MODERATION_STATUS,
  getStatusIcon,
} from "metabase-enterprise/moderation/service";

const { color: verifiedIconColor } = getStatusIcon(MODERATION_STATUS.verified);

export const VerifyButton = styled((props: ButtonProps) => (
  <Button {...props} iconSize={props.iconSize ?? 20} />
))`
  color: ${() => color(verifiedIconColor)};
  border: none;
  padding: 8px;

  &:disabled {
    color: var(--mb-color-text-secondary);
  }

  position: relative;
  right: 8px;
`;
