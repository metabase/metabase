// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import { Link } from "metabase/common/components/Link";
import { maybeColor } from "metabase/ui/utils/colors";

interface RawMaybeLinkProps {
  to?: string;
  activeColor?: string;
  inactiveColor?: string;
  isSingleLine?: boolean;
}

export function RawMaybeLink({
  to,
  activeColor,
  inactiveColor,
  isSingleLine,
  ...props
}: RawMaybeLinkProps & (LinkProps | HTMLAttributes<HTMLSpanElement>)) {
  return to ? <Link to={to} {...props} /> : <span {...props} />;
}

const hoverStyle = (props: RawMaybeLinkProps) => css`
  cursor: pointer;
  ${props.activeColor ? `color: ${maybeColor(props.activeColor)};` : ""}
`;

/**
 * @deprecated styled components are deprecated
 */
export const MaybeLink = styled(RawMaybeLink)`
  display: flex;
  align-items: center;
  font-size: 0.875em;
  font-weight: bold;
  ${(props) =>
    props.inactiveColor ? `color: ${maybeColor(props.inactiveColor)};` : ""}
  min-width: ${(props) => (props.isSingleLine ? 0 : "")};

  :hover {
    ${(props) => (props.to || props.onClick) && hoverStyle(props)}
  }
`;
