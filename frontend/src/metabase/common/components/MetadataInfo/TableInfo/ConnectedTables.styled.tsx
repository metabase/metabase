// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Link from "metabase/common/components/Link";

import TableLabel from "../TableLabel/TableLabel";

export const InteractiveTableLabel = styled(TableLabel)`
  color: var(--mb-color-text-tertiary);
`;

export const LabelButton = styled.button`
  cursor: pointer;
  text-align: left;

  &:hover,
  &:focus {
    ${InteractiveTableLabel} {
      color: var(--mb-color-brand);
    }
  }
`;

export const LabelLink = styled(Link)`
  &:hover,
  &:focus {
    ${InteractiveTableLabel} {
      color: var(--mb-color-brand);
    }
  }
`;
