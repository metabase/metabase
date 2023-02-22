import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import FieldList from "metabase/query_builder/components/FieldList";

export const SortFieldList = styled(FieldList)`
  color: ${color("summarize")};
`;
