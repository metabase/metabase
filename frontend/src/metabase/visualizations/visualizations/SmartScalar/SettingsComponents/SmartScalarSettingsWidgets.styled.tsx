import type { HTMLAttributes } from "react";
import styled from "@emotion/styled";
import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

type DoneButtonProps = ButtonProps & HTMLAttributes<HTMLButtonElement>;

export const DoneButton = styled(Button)<DoneButtonProps>`
  align-self: flex-end;
`;

DoneButton.defaultProps = {
  variant: "filled",
};
