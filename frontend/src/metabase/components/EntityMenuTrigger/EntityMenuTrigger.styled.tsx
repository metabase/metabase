import styled from "@emotion/styled";

import Button, { type ButtonProps } from "metabase/core/components/Button";

export interface EntityMenuIconButtonProps extends ButtonProps {
  className?: string;
  color?: string;
  hover?: {
    color: string;
    backgroundColor: string;
  };
  "data-testid"?: string;
}

export const EntityMenuIconButton = styled(
  (props: EntityMenuIconButtonProps) => (
    <Button
      {...props}
      iconSize={props.iconSize ?? 16}
      onlyIcon={props.onlyIcon ?? true}
    />
  ),
)`
  width: 36px;
  height: 36px;

  ${({ color }) => (color ? `color: ${color}` : null)};

  &:hover {
    ${({ hover }) => (hover?.color ? `color: ${hover.color}` : null)};
    background-color: ${({ hover }) =>
      hover?.backgroundColor
        ? hover.backgroundColor
        : "var(--mb-color-bg-medium)"};
  }
`;
