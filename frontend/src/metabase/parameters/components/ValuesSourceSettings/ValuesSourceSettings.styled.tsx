import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const RadioLabelRoot = styled.span`
  display: flex;
`;

export const RadioLabelTitle = styled.span`
  flex: 1 1 auto;
`;

export const RadioLabelButton = styled(IconButtonWrapper)`
  color: var(--mb-color-text-dark);
  margin-left: 1rem;
  font-weight: bold;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const ClickAreaExpander = styled.span`
  display: inline-block;
  padding: 0 5px;
`;
