// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ComponentProps, FC } from "react";
import { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";

import { focusOutlineStyle } from "metabase/common/style/input";
import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";

type LinkVariantProp = { variant?: "default" | "brand" | "brandBold" };
import { type LinkToWithQuery, normalizeTo } from "./utils";

type RouterLinkProps = Omit<ComponentProps<typeof RouterLink>, "to"> & {
  to: LinkToWithQuery;
};

const QueryAwareRouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
  function QueryAwareRouterLink({ to, ...props }, ref) {
    return <RouterLink {...props} ref={ref} to={normalizeTo(to)} />;
  },
);

export const LinkRoot = styled(
  QueryAwareRouterLink,
  doNotForwardProps("variant"),
)<LinkVariantProp>`
  opacity: ${(props) => (props.disabled ? "0.4" : "")};
  pointer-events: ${(props) => (props.disabled ? "none" : "")};
  transition: opacity 0.3s linear;

  ${focusOutlineStyle("brand")};

  ${(props) => variants[props.variant ?? "default"] ?? ""}
` as unknown as FC<RouterLinkProps & LinkVariantProp>;

const variants = {
  default: "",
  brand: css`
    color: var(--mb-color-brand);

    &:hover {
      text-decoration: underline;
    }
  `,
  brandBold: css`
    color: var(--mb-color-brand);
    font-weight: bold;

    &:hover {
      text-decoration: underline;
    }
  `,
};
