import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

type ShortcutButtonProps = {
  primaryColor?: string;
};

export const ShortcutButton = styled(Button)<ShortcutButtonProps>`
  display: block;
  border: none;

  &:hover {
    color: ${props => props.primaryColor || color("brand")};
    background: none;
  }
`;

export const Separator = styled.div`
  margin: 1rem;
  border-top: solid 1px ${color("text-light")};
  opacity: 0.5;
`;
