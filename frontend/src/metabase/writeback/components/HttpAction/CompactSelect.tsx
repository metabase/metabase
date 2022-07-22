import styled from "@emotion/styled";

import Select from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";

import { color } from "metabase/lib/colors";

const CompactSelect = styled(Select)`
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

CompactSelect.defaultProps = {
  width: 120,
};

export default CompactSelect;
