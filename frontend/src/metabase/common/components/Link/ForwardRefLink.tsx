// Fixes this bug: https://github.com/mantinedev/mantine/issues/5571#issue-2082430353
// Hover states get weird when using Link directly. Since Link does not take the standard
// `ref` prop, we have to manually forward it to `innerRef`.
import { forwardRef } from "react";

import { Link } from "metabase/routing/compat/react-router-v3";

import type { LinkProps } from "./types";

export const ForwardRefLink = forwardRef(function _ForwardRefLink(
  props: LinkProps,
  ref,
) {
  // @ts-expect-error `innerRef` is supported by react-router v3 but missing in types.
  return <Link {...props} innerRef={ref} />;
});
