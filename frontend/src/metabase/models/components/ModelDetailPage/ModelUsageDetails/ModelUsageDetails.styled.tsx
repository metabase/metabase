import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

export const CardTitle = styled.span`
  font-weight: 700;
`;

export const CardListItem = styled(Link)`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  padding: 1rem 0.5rem;

  ${CardTitle} {
    margin-left: 1rem;
  }

  &:hover {
    background-color: ${color("brand-light")};
  }
`;
