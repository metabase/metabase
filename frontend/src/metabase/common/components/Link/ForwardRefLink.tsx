// Fixes this bug: https://github.com/mantinedev/mantine/issues/5571#issue-2082430353
// Hover states get weird when using Link directly. Since Link does not take the standard

import { forwardRef } from "react";

import { BaseLink, type BaseLinkProps } from "./BaseLink";

// `ref` prop, we have to manually forward it to the correct prop name to make hover work as expected.
export const ForwardRefLink = forwardRef<HTMLAnchorElement, BaseLinkProps>(
  function _ForwardRefLink(props, ref) {
    return <BaseLink {...props} innerRef={ref} />;
  },
);
