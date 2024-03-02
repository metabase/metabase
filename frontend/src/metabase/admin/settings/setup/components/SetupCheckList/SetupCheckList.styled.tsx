import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link } from "react-router";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";

export const SetupListRoot = styled.div`
  display: flex;
  justify-content: space-between;
`;

const linkStyles = css`
  display: flex;
  align-items: center;
  padding: 1rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  transition: border 0.3s linear;
  text-decoration: none;

  &:hover {
    border-color: ${color("brand")};
  }
`;

export const TaskRegularLink = styled(Link)`
  ${linkStyles}
`;

export const TaskExternalLink = styled(ExternalLink)`
  ${linkStyles}
`;
