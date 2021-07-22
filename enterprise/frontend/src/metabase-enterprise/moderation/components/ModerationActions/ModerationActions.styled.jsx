import styled from "styled-components";

import { color } from "metabase/lib/colors";
import { getVerifiedIcon } from "metabase-enterprise/moderation/service";

const { icon: verifiedIcon, iconColor: verifiedIconColor } = getVerifiedIcon();

import Button from "metabase/components/Button";

export const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const Label = styled.h5`
  font-size: 14px;
  color: ${color("text-medium")};
  flex: 1;
`;

export const VerifyButton = styled(Button).attrs({
  icon: verifiedIcon,
  iconSize: 20,
})`
  border: none;

  &:hover {
    color: ${color(verifiedIconColor)};
  }

  &:disabled {
    color: ${color("text-medium")};
  }
`;
