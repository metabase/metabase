import { t } from "ttag";

import type { DatasetEditorTab } from "metabase/redux/store";
import { Button, Group, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type Props = {
  currentTab: string;
  disabledQuery: boolean;
  disabledColumns: boolean;
  onChange: (optionId: DatasetEditorTab) => void;
};

type TabOption = {
  id: DatasetEditorTab;
  name: string;
  icon: IconName;
  disabled: boolean;
};

export const EditorTabs = ({
  currentTab,
  disabledQuery,
  disabledColumns,
  onChange,
}: Props) => {
  const tabs: TabOption[] = [
    { id: "query", name: t`Query`, icon: "sql", disabled: disabledQuery },
    {
      id: "columns",
      name: t`Columns`,
      icon: "notebook",
      disabled: disabledColumns,
    },
    { id: "metadata", name: t`Settings`, icon: "gear", disabled: false },
  ];

  return (
    <Group role="radiogroup" gap="sm" wrap="nowrap">
      {tabs.map(({ id, name, icon, disabled }) => {
        const isActive = currentTab === id;
        return (
          <Button
            key={id}
            role="radio"
            aria-checked={isActive}
            variant={isActive ? "on-dark-primary" : "on-dark-secondary"}
            leftSection={<Icon name={icon} />}
            disabled={disabled}
            onClick={() => {
              if (!isActive) {
                onChange(id);
              }
            }}
            data-testid={`editor-tabs-${id}`}
          >
            <span data-testid={`editor-tabs-${id}-name`}>{name}</span>
          </Button>
        );
      })}
    </Group>
  );
};
