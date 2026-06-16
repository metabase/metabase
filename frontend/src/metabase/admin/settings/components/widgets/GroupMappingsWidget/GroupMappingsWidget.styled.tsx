// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

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
  align-items: center;
  background-color: var(--mb-color-background-secondary);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  display: flex;
  min-height: 3.5rem;
  padding: var(--mantine-spacing-sm) var(--mantine-spacing-md);
`;

export const GroupMappingsWidgetAbout = styled.div`
  align-items: center;
  color: var(--mb-color-text-secondary);
  display: flex;
  flex-direction: row;
  margin-left: auto;

  span {
    padding-left: var(--mantine-spacing-sm);
  }
`;

export const GroupMappingsWidgetAboutContentRoot = styled.div`
  display: flex;
  align-items: center;
`;
