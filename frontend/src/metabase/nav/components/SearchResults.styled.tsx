import styled from "@emotion/styled";
import { Group } from "metabase/ui";

export const EmptyStateContainer = styled.div`
  margin-top: 4rem;
  margin-bottom: 2rem;
`;

export const SearchDropdownFooter = styled(Group)`
  border-top: 1px solid ${({ theme }) => theme.colors.border[0]};

  &:hover {
    background-color: ${({ theme }) => theme.colors.bg[0]};
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
  }
`;
