import styled from "@emotion/styled";

import Select from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";
import { color } from "metabase/lib/colors";

export const SelectWithHighlightingIcon = styled(Select)`
  ${SelectButton.Icon}:hover {
    color: ${color("brand")};
  }
`;
