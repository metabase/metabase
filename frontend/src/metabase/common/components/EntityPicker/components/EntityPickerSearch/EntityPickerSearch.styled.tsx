import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { SearchResult } from "metabase/search/components/SearchResult";

export const EntityPickerSearchResult = styled(SearchResult)<{
  isSelected: boolean;
}>`
  width: 40rem;
  ${({ isSelected }) => isSelected && `border: 1px solid ${color("brand")}`}
`;
