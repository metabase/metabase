import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { SearchResult } from "metabase/search/components/SearchResult";

export const EntityPickerSearchResult = styled(SearchResult)<{
  isSelected: boolean;
}>`
  width: 40rem;
  border: 1px solid
    ${({ isSelected }) => (isSelected ? color("brand") : "transparent")};
  margin-bottom: 1px;
`;
