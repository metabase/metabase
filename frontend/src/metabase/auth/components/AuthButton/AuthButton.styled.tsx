import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

export const TextLink = styled(Link)`
  cursor: pointer;
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const CardLink = styled(TextLink)`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.25rem;
  background-color: ${color("white")};
  box-shadow: 0 3px 10px ${color("shadow")};
  border-radius: 6px;
`;

export const CardText = styled.span`
  font-weight: 700;
  line-height: 1rem;
`;
