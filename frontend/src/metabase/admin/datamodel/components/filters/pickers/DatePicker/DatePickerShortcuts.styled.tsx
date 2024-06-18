import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

type ShortcutButtonProps = {
  primaryColor?: string;
};

export const ShortcutButton = styled(Button)<ShortcutButtonProps>`
  display: block;
  border: none;
  &:hover {
    color: ${props => props.primaryColor || "var(--mb-color-brand)"};
    background: none;
  }
`;

export const Separator = styled.div`
  margin: 1rem;
  border-top: solid 1px var(--mb-color-text-light);
  opacity: 0.5;
`;
