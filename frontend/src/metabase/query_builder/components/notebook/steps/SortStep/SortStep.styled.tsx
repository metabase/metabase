import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import FieldList from "metabase/query_builder/components/FieldList";

export const SortDirectionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  color: ${color("white")};
  font-weight: 700;
  cursor: pointer;
`;

export const SortFieldList = styled(FieldList)`
  color: ${color("summarize")};
`;
