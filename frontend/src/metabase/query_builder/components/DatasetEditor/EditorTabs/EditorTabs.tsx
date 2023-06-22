import { Icon, IconName } from "metabase/core/components/Icon";

import { TabBar, Tab, RadioInput } from "./EditorTabs.styled";

type Props = {
  currentTab: string;
  options: {
    id: string;
    name: string;
    icon: IconName;
    disabled?: boolean;
  }[];
  onChange: (optionId: string) => void;
};

function EditorTabs({ currentTab, options, onChange, ...props }: Props) {
  const inputId = "editor-tabs";

  return (
    <TabBar {...props}>
      {options.map(option => {
        const selected = currentTab === option.id;
        const id = `${inputId}-${option.id}`;
        const labelId = `${id}-label`;
        return (
          <li key={option.id}>
            <Tab
              id={labelId}
              htmlFor={id}
              selected={selected}
              disabled={option.disabled}
            >
              <Icon name={option.icon} />
              <RadioInput
                id={id}
                name={inputId}
                value={option.id}
                checked={selected}
                onChange={() => {
                  onChange(option.id);
                }}
                aria-labelledby={labelId}
                disabled={option.disabled}
                data-testid={id}
              />
              <span data-testid={`${id}-name`}>{option.name}</span>
            </Tab>
          </li>
        );
      })}
    </TabBar>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EditorTabs;
