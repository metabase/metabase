// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ComponentProps, FC } from "react";

import { focusOutlineStyle } from "metabase/common/style/input";
import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import { Link } from "metabase/routing/compat/react-router-v3";

type LinkVariantProp = { variant?: "default" | "brand" | "brandBold" };
type RouterLinkProps = ComponentProps<typeof Link>;

export const LinkRoot = styled(
  Link,
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
