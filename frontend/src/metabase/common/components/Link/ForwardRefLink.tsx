// Fixes this bug: https://github.com/mantinedev/mantine/issues/5571#issue-2082430353
// Hover states get weird when using Link directly. Since Link does not take the standard
// `ref` prop, we have to manually forward it to `innerRef`.
import { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";

import type { LinkProps } from "./types";
import { normalizeTo } from "./utils";

export const ForwardRefLink = forwardRef(function _ForwardRefLink(
  props: LinkProps,
  ref,
) {
  return <RouterLink {...props} ref={ref} to={normalizeTo(props.to)} />;
});
