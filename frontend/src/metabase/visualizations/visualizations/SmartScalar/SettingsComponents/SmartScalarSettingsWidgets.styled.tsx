// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import cx from "classnames";
import type { HTMLAttributes } from "react";

import CS from "metabase/css/core/index.css";
import type { ButtonProps as BaseButtonProps, TextProps } from "metabase/ui";
import { Button, Icon, Text } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;

export const ComparisonList = styled.ul`
  li:not(:first-of-type) {
    margin-top: 8px;
  }
`;

export const AddComparisonButton = styled((props: ButtonProps) => (
  <Button {...props} variant={props.variant ?? "subtle"} />
))`
  align-self: flex-start;
  padding: 0;
`;

type ComparisonPickerSecondaryTextProps = TextProps &
  HTMLAttributes<HTMLSpanElement> & {
    component?: "span";
  };

export const ComparisonPickerSecondaryText = styled(
  (props: ComparisonPickerSecondaryTextProps) => (
    <Text {...props} component={props.component ?? "span"} />
  ),
)<ComparisonPickerSecondaryTextProps>``;

export const ComparisonPickerButton = styled(Button)<ButtonProps>`
  height: 40px;

  &:hover {
    ${ComparisonPickerSecondaryText} {
      color: var(--mb-color-brand);
    }
  }
` as unknown as typeof Button;

export const DoneButton = (props: ButtonProps) => (
  <Button
    {...props}
    variant={props.variant ?? "filled"}
    className={cx(CS.alignSelfEnd, props.className)}
  />
);

export const DragHandleIcon = styled(Icon)`
  cursor: grab;
  color: var(--mb-color-text-primary);
`;

export const ExpandIcon = styled(Icon)`
  margin-left: 8px;
`;

export const RemoveIcon = styled(Icon)`
  color: var(--mb-color-text-primary);
`;
