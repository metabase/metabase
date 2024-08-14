import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex-wrap: no-wrap;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--mb-color-border);
  padding: ${space(1)} ${space(2)} ${space(2)} ${space(2)};
`;

export const ToggleButton = styled(Button)`
  border: none;
  border-radius: 0;
  background: none;
  display: flex;
  align-items: center;
  font-weight: normal;

  &:hover {
    color: var(--mb-color-text-brand);
    background: none;
  }
`;

export const Interval = styled.div`
  display: flex;
  align-items: center;
  font-weight: normal;
  color: var(--mb-color-text-medium);
  margin-right: ${space(2)};
`;
