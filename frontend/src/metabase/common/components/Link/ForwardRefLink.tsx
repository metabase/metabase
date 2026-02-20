// Fixes this bug: https://github.com/mantinedev/mantine/issues/5571#issue-2082430353
// Hover states get weird when using Link directly. Since Link does not take the standard
// `ref` prop, we have to manually forward it to `innerRef`.
import type { ComponentProps } from "react";
import { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";

import type { LinkToWithQuery } from "./utils";
import { normalizeTo } from "./utils";

type ForwardRefLinkProps = Omit<ComponentProps<typeof RouterLink>, "to"> & {
  to: LinkToWithQuery;
};

export const ForwardRefLink = forwardRef<
  HTMLAnchorElement,
  ForwardRefLinkProps
>(function ForwardRefLink(props, ref) {
  return <RouterLink {...props} ref={ref} to={normalizeTo(props.to)} />;
});
