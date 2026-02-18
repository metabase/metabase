// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { EditableText as EditableTextBase } from "metabase/common/components/EditableText";
import { Select } from "metabase/common/components/Select";
import { SelectButton } from "metabase/common/components/SelectButton";

export const Container = styled.div`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: var(--mb-color-background-primary);
  border-bottom: 1px solid var(--mb-color-border);
  padding: var(--mantine-spacing-md) var(--mantine-spacing-xl);
`;

export const LeftHeader = styled.div`
  display: flex;
  align-items: center;
  color: var(--mb-color-text-secondary);
  gap: var(--mantine-spacing-md);
`;

export const EditableText = styled(EditableTextBase)`
  font-weight: bold;
  font-size: 1.3em;
  color: var(--mb-color-text-secondary);
`;

export const CompactSelect = styled(Select)`
  ${SelectButton.Root} {
    border: none;
    border-radius: 6px;
    min-width: 80px;
    color: var(--mb-color-text-secondary);
  }
  ${SelectButton.Content} {
    margin-right: 6px;
  }
  ${SelectButton.Icon} {
    margin-left: 0;
  }

  &:hover {
    ${SelectButton.Root} {
      background-color: var(--mb-color-background-secondary);
    }
  }
`;

export const ActionButtons = styled.div`
  /* Since the button is borderless, adding the negative margin
     will make it look flush with the container */
  &:last-child {
    margin-right: calc(var(--mantine-spacing-sm) * -1);
  }
`;
