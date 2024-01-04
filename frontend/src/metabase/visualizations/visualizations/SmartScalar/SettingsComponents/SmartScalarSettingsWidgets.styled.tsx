import type { HTMLAttributes } from "react";
import styled from "@emotion/styled";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;

export const ComparisonList = styled.ul`
  li:not(:first-of-type) {
    margin-top: 8px;
  }
`;

export const AddComparisonButton = styled(Button)<ButtonProps>`
  align-self: flex-start;
  padding: 0;
`;

AddComparisonButton.defaultProps = {
  variant: "subtle",
};

export const DoneButton = styled(Button)<ButtonProps>`
  align-self: flex-end;
`;

DoneButton.defaultProps = {
  variant: "filled",
};

export const DragHandleIcon = styled(Icon)`
  cursor: grab;
  color: ${color("text-dark")};
`;

export const ExpandIcon = styled(Icon)`
  margin-left: 8px;
`;

export const RemoveIcon = styled(Icon)`
  color: ${color("text-dark")};
`;
