import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";

export const SearchTypeaheadCard = styled(Card)`
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem 0;
`;

export const SearchResultList = styled.ol``;
export const NoSearchResults = styled.li`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: ${color("text-medium")};
  text-align: center;
  margin: 1.5rem 0;
`;
