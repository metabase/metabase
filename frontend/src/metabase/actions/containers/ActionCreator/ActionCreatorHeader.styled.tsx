import styled from "@emotion/styled";

import EditableTextBase from "metabase/core/components/EditableText";
import Select from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: ${color("white")};
  border-bottom: 1px solid ${color("border")};
  padding: ${space(2)} ${space(3)};
`;

export const LeftHeader = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  gap: ${space(2)};
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

export const ActionButtons = styled.div`
  /* Since the button is borderless, adding the negative margin
     will make it look flush with the container */
  &:last-child {
    margin-right: -${space(1)};
  }
`;
