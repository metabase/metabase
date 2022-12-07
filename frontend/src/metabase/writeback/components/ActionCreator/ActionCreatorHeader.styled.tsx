import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Select from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import EditableTextBase from "metabase/core/components/EditableText";
import ButtonBase from "metabase/core/components/Button";

export const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: ${color("white")};
  border-top: 1px solid ${color("border")};
  padding: ${space(1)} ${space(3)};
`;

export const LeftHeader = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  & > * ~ * {
    margin-left: ${space(2)};
    margin-right: ${space(2)};
  }
`;

export const SaveButton = styled(ButtonBase)<{ disabled: boolean }>`
  font-weight: 600;
  color: ${props => (!props.disabled ? color("brand") : color("text-medium"))};
  background-opacity: 0.25;
  padding: 0;
  &:hover {
    color: ${color("accent0-light")};
  }
`;

export const EditableText = styled(EditableTextBase)`
  font-weight: bold;
  font-size: 1.3em;
  color: ${color("text-medium")};
`;

export const Option = styled.div`
  color: ${color("text-medium")};
  ${disabled => disabled && `color: ${color("text-medium")}`};
`;

export const CompactSelect = styled(Select)`
  ${SelectButton.Root} {
    border: none;
    border-radius: 6px;
    min-width: 80px;
    color: ${color("text-medium")};
  }
  ${SelectButton.Content} {
    margin-right: 6px;
  }
  ${SelectButton.Icon} {
    margin-left: 0;
  }
  &:hover {
    ${SelectButton.Root} {
      background-color: ${color("bg-light")};
    }
  }
`;
