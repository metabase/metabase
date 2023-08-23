import styled from "@emotion/styled";
import { Flex } from "metabase/ui";

export const SearchFilterSidebarItem = styled(Flex)`
  ${({ theme }) => {
    return `
    border: 2px solid ${theme.colors.border[0]};
    border-radius: 8px;
    `;
  }}
`;
