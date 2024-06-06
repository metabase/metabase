import styled from "@emotion/styled";

import Select from "metabase/core/components/Select";
import SelectButton from "metabase/core/components/SelectButton";

export const SelectWithHighlightingIcon = styled(Select)`
  ${SelectButton.Icon}:hover {
    color: var(--mb-color-brand);
  }
`;
