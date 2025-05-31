import { Link } from "react-router";

import { Button, type ButtonProps } from "metabase/ui";

// component={Link} breaks the styling when the button is disabled
// disabling a link button doesn't look like a common enough scenario to make an exported component
export const LinkButton = ({
  to,
  disabled,
  ...buttonProps
}: { to: string; disabled?: boolean } & ButtonProps) => {
  return disabled ? (
    <Button disabled={disabled} {...buttonProps} />
  ) : (
    <Link to={to}>
      <Button {...buttonProps} />
    </Link>
  );
};
