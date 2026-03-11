// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import { Link } from "metabase/common/components/Link";
import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import { Icon } from "metabase/ui";
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

export const BadgeIcon = styled(
  Icon,
  doNotForwardProps("hasMargin", "targetOffsetX"),
)<{ hasMargin: boolean }>`
  margin-right: ${(props) => (props.hasMargin ? "5px" : 0)};
  flex-shrink: 0;
`;

export const BadgeText = styled.span<{ isSingleLine: boolean }>`
  overflow: ${(props) => (props.isSingleLine ? "hidden" : "")};
  text-overflow: ${(props) => (props.isSingleLine ? "ellipsis" : "")};
  white-space: ${(props) => (props.isSingleLine ? "nowrap" : "")};
`;
