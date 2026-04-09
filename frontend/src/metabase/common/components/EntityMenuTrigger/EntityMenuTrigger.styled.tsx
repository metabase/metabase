// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/common/components/Button";

export interface EntityMenuIconButtonProps extends ButtonProps {
  className?: string;
  color?: string;
  hover?: {
    color: string;
    backgroundColor: string;
  };
  "data-testid"?: string;
}

const EntityMenuIconButtonInner = forwardRef<
  HTMLButtonElement,
  EntityMenuIconButtonProps
>(function EntityMenuIconButtonInner(props, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      iconSize={props.iconSize ?? 16}
      onlyIcon={props.onlyIcon ?? true}
    />
  );
});

export const EntityMenuIconButton = styled(EntityMenuIconButtonInner)`
  width: 36px;
  height: 36px;

  ${({ color }) => (color ? `color: ${color}` : null)};

  &:hover {
    ${({ hover }) => (hover?.color ? `color: ${hover.color}` : null)};
    background-color: ${({ hover }) =>
      hover?.backgroundColor
        ? hover.backgroundColor
        : "var(--mb-color-background-tertiary)"};
  }
`;
