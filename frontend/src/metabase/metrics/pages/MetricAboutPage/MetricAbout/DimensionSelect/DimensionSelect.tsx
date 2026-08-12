import { t } from "ttag";

import {
  Combobox,
  DefaultSelectItem,
  Icon,
  UnstyledButton,
  useCombobox,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./DimensionSelect.module.css";

interface DimensionOption {
  icon: IconName;
  label: string;
  value: string;
}

interface DimensionSelectProps {
  label: string;
  options: readonly DimensionOption[];
  value: string;
  onChange: (value: string) => void;
}

export function DimensionSelect({
  label,
  options,
  value,
  onChange,
}: DimensionSelectProps) {
  const combobox = useCombobox();

  const handleOptionSubmit = (newValue: string) => {
    onChange(newValue);
    combobox.closeDropdown();
  };

  return (
    <Combobox
      store={combobox}
      position="top"
      width="max-content"
      withinPortal
      middlewares={{ flip: true, shift: true, size: true }}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <UnstyledButton
          aria-label={t`Select dimension: ${label}`}
          className={S.trigger}
          onClick={() => combobox.toggleDropdown()}
        >
          <span className={S.label}>{label}</span>
          <Icon flex="0 0 0.75rem" ml="sm" name="chevrondown" size={12} />
        </UnstyledButton>
      </Combobox.Target>
      <Combobox.Dropdown className={S.dropdown}>
        <Combobox.Options>
          {options.map((option) => (
            <Combobox.Option
              key={option.value}
              value={option.value}
              selected={option.value === value}
              p={0}
            >
              <DefaultSelectItem
                value={option.value}
                label={option.label}
                icon={option.icon}
                selected={option.value === value}
              />
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
