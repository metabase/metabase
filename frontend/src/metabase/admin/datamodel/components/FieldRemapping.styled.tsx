import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import SelectButton from "metabase/core/components/SelectButton";
import FieldList from "metabase/query_builder/components/FieldList";

export const FieldMappingContainer = styled.div`
  display: flex;
  align-items: center;
`;

export interface FieldSelectButtonProps {
  hasError: boolean;
}

export const FieldSelectButton = styled(SelectButton)<FieldSelectButtonProps>`
  border-color: ${props =>
    props.hasError ? color("error") : alpha("accent2", 0.2)};
`;

export const ForeignKeyList = styled(FieldList)`
  color: ${color("filter")};
`;
