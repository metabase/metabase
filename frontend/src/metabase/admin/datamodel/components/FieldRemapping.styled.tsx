import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import FieldList from "metabase/query_builder/components/FieldList";

export const FieldMappingContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const ForeignKeyList = styled(FieldList)`
  color: ${color("filter")};
`;
