import { assocIn } from "icepick";
import { t } from "ttag";

import {
  Combobox,
  DefaultSelectItem,
  UnstyledButton,
  useCombobox,
} from "metabase/ui";
import type { ClickBehavior } from "metabase-types/api";

import S from "./ClickMappings.module.css";
import type { SourceOption, SourceOptionsByType, TargetItem } from "./types";

export function ClickMappingsTargetWithoutSource({
  target,
  sourceOptions,
  clickBehavior,
  updateSettings,
}: {
  target: TargetItem;
  sourceOptions: SourceOptionsByType;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { id, name, type } = target;
  const combobox = useCombobox();

  const handleOptionSubmit = (value: string) => {
    const source = Object.values(sourceOptions)
      .flat()
      .find((option) => getValueForSource(option) === value);

    updateSettings(
      assocIn(clickBehavior, ["parameterMapping", id], {
        source,
        target: target.target,
        id,
        type,
      }),
    );
    combobox.closeDropdown();
  };

  return (
    <Combobox
      key={id}
      store={combobox}
      position="bottom-start"
      width={300}
      classNames={{ groupLabel: S.groupLabel }}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <UnstyledButton
          className={S.TargetTrigger}
          style={{ outline: "none" }}
          p="sm"
          fw="bold"
          data-testid="click-target-column"
          onClick={() => combobox.toggleDropdown()}
        >
          {name}
        </UnstyledButton>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {Object.entries(sourceOptions).map(([sourceType, items]) => (
            <Combobox.Group
              key={sourceType}
              label={
                {
                  parameter: t`Dashboard filters`,
                  column: t`Columns`,
                  userAttribute: t`User attributes`,
                }[sourceType]
              }
            >
              {items.map((option) => {
                const value = getValueForSource(option);
                return (
                  <Combobox.Option key={value} value={value} p={0}>
                    <DefaultSelectItem
                      pl="lg"
                      value={value}
                      fw="700"
                      label={option.type === undefined ? t`None` : option.name}
                    />
                  </Combobox.Option>
                );
              })}
            </Combobox.Group>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

const getValueForSource = (option: SourceOption) =>
  option.type == null ? "none" : `${option.type}-${option.id}`;
