import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex-wrap: nowrap;
  padding-left: ${space(1)};
  border-bottom: 1px solid var(--mb-color-border);
`;

type TabButtonProps = {
  selected?: boolean;
};

export const TabButton = styled(Button)<TabButtonProps>`
  border: none;
  border-radius: 0;
  padding-left: 0;
  padding-right: 0;
  margin-left: ${space(2)};
  margin-right: ${space(2)};
  ${({ selected }) =>
    selected
      ? css`
          border-bottom: 2px solid var(--mb-color-text-brand);
          color: var(--mb-color-text-brand);
        `
      : css`
          border-bottom: 2px solid transparent;
          color: var(--mb-color-text-secondary);
        `}

  &:hover {
    background: none;
    color: var(--mb-color-text-brand);
    border-color: var(--mb-color-text-brand);
  }
`;

export const BackButton = styled(TabButton)`
  border: none;
  border-radius: 0;
  margin-left: ${space(1)};
  color: var(--mb-color-text-secondary);

  &:hover {
    color: var(--mb-color-text-brand);
  }
`;
