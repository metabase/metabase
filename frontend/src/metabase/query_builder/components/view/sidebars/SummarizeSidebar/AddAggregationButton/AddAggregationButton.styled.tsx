import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const AddAggregationButtonRoot = styled(Button)`
  padding: 0.625rem;

  color: var(--mb-color-summarize);
  background-color: var(--mb-color-bg-light);

  &:hover {
    color: var(--mb-color-summarize);
    background-color: ${color("bg-medium")};
  }
`;
