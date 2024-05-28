import { css } from "@emotion/react";
import styled from "@emotion/styled";
import PropTypes from "prop-types";

import Badge from "metabase/components/Badge";
import { color } from "metabase/lib/colors";

export const HeaderBadge = styled(Badge)`
  .Icon {
    width: 1em;
    height: 1em;
    margin-right: 0.5em;
  }
`;

export const Container = styled.span<{ variant: string }>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  ${HeaderBadge} {
    ${props =>
      props.variant === "head" &&
      css`
        font-size: 1.25rem;
      `}
  }
`;

const DividerSpan = styled.span`
  color: ${color("text-light")};
  font-size: 0.8em;
  font-weight: bold;
  padding-left: 0.5em;
  padding-right: 0.5em;
  user-select: none;
`;

Divider.propTypes = {
  char: PropTypes.string,
};

export function Divider({ char = "/" }) {
  return <DividerSpan>{char}</DividerSpan>;
}
