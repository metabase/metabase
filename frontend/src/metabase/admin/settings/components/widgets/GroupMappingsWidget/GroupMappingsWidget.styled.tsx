// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Button from "metabase/common/components/Button";

export const GroupMappingsWidgetAndErrorRoot = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const GroupMappingsWidgetRoot = styled.div`
  border: 1px solid var(--mb-color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-width: 720px;
  width: 100%;
`;

export const GroupMappingsWidgetHeader = styled.div`
  background-color: var(--mb-color-background-secondary);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--mantine-spacing-md);
  padding: var(--mantine-spacing-sm) var(--mantine-spacing-md);

  span {
    font-weight: 700;
  }
`;

export const GroupMappingsWidgetToggleRoot = styled.div`
  align-items: center;
  display: flex;

  > * {
    color: var(--mb-color-text-primary);
    padding-right: var(--mantine-spacing-sm);
    padding-top: 0;
  }
`;

export const GroupMappingsWidgetAbout = styled.div`
  align-items: center;
  color: var(--mb-color-text-secondary);
  display: flex;
  flex-direction: row;

  span {
    padding-left: var(--mantine-spacing-sm);
  }
`;

export const GroupMappingsWidgetAboutContentRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const AddMappingButton = styled(Button)`
  float: right;
  margin-right: var(--mantine-spacing-md);
  margin-bottom: -40px;
`;
