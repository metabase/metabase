// Fixes this bug: https://github.com/mantinedev/mantine/issues/5571#issue-2082430353
// Hover states get weird when using Link directly. Since Link does not take the standard

import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router";

// `ref` prop, we have to manually forward it to the correct prop name to make hover work as expected.
export const ForwardRefLink = forwardRef(function _ForwardRefLink(
  props: LinkProps,
  ref,
) {
  // @ts-expect-error - innerRef not in prop types but it is a valid prop. docs can be found here: https://github.com/remix-run/react-router/blob/v3.2.6/docs/API.md#innerref
  return <Link {...props} innerRef={ref} />;
});
