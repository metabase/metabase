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
  font-size: 11px;
  text-transform: uppercase;
  color: ${color("text-medium")};
  flex: 1;
`;

export const VerifyButton = styled(Button).attrs({
  icon: verifiedIcon,
  iconOnly: true,
  size: 20,
})`
  border: none;

  &:hover {
    background-color: transparent;
    color: ${color(verifiedIconColor)};
  }

  &:disabled {
    color: ${color("text-medium")};
  }
`;
