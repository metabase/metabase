import styled from "@emotion/styled";

import { FieldList } from "metabase/admin/datamodel/components/FieldList";
import InputBlurChange from "metabase/components/InputBlurChange";
import SelectButton from "metabase/core/components/SelectButton";
import { alpha, color } from "metabase/lib/colors";

export const FieldMappingRoot = styled.div`
  padding: 1rem 4rem;
  border: 1px solid ${alpha("accent2", 0.2)};
  border-radius: 0.5rem;
`;

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

export const FieldValueMappingInput = styled(InputBlurChange)`
  width: auto;
`;
