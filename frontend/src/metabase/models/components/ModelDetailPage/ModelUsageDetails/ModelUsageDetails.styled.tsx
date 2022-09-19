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

export const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  margin-top: 3rem;
`;

export const EmptyStateTitle = styled.span`
  display: block;
  color: ${color("text-medium")};
  font-size: 1rem;
  line-height: 1.5rem;
  margin-bottom: 1rem;
  text-align: center;
`;
