import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import {
  MODERATION_STATUS,
  getStatusIcon,
} from "metabase-enterprise/moderation/service";

const { color: verifiedIconColor } = getStatusIcon(MODERATION_STATUS.verified);

export const VerifyButton = styled(Button)`
  color: ${color(verifiedIconColor)};
  border: none;
  padding: 8px;

  &:disabled {
    color: ${color("text-medium")};
  }

  position: relative;
  right: 8px;
`;

VerifyButton.defaultProps = {
  iconSize: 20,
};
