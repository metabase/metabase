import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { LinkProps } from "metabase/core/components/Link";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

interface RawMaybeLinkProps {
  to?: string;
  activeColor: string;
  inactiveColor: string;
  isSingleLine: boolean;
}

function RawMaybeLink({
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
  color: ${color(props.activeColor)};
`;

export const MaybeLink = styled(RawMaybeLink)`
  display: flex;
  align-items: center;
  font-size: 0.875em;
  font-weight: bold;
  color: ${props => color(props.inactiveColor)};
  min-width: ${props => (props.isSingleLine ? 0 : "")};

  :hover {
    ${props => (props.to || props.onClick) && hoverStyle(props)}
  }
`;

export const BadgeIcon = styled(Icon)<{ hasMargin: boolean }>`
  margin-right: ${props => (props.hasMargin ? "5px" : 0)};
`;

export const BadgeText = styled.span<{ isSingleLine: boolean }>`
  overflow: ${props => (props.isSingleLine ? "hidden" : "")};
  text-overflow: ${props => (props.isSingleLine ? "ellipsis" : "")};
  white-space: ${props => (props.isSingleLine ? "nowrap" : "")};
`;
