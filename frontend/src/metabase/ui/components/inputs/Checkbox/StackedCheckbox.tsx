import { Checkbox } from "@mantine/core";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const StackedCheckbox = styled(Checkbox)`
  & .emotion-Checkbox-inner {
    postion: relative;
    z-index: 0;
  }

  //Stack icon creeps closer to the label, so give extra padding when on the left.
  & .emotion-Checkbox-label {
    ${({ labelPosition }) =>
      labelPosition === "right" && "padding-left: 0.75rem;"}
  }

  & .emotion-Checkbox-input {
    &:after {
      content: "";
      border: 1px solid ${({ theme }) => theme.colors.gray[4]};
      position: absolute;
      top: -4px;
      left: 4px;
      height: 100%;
      width: 100%;
      border-radius: 4px;
      z-index: -1;
      background-color: white;
      box-sizing: border-box;
    }

    &:checked:after {
      border: 2px solid ${color("brand")};
    }
  }

  //Center the label on the total stacked icon
  & .emotion-Checkbox-body {
    align-items: center;
  }
  & .emotion-Checkbox-labelWrapper {
    padding-bottom: 2px;
  }
`;
