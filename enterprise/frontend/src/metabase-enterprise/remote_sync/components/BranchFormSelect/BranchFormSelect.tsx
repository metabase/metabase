import { useField } from "formik";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  DefaultSelectItem,
  Icon,
  Select,
  SelectItem,
  type SelectOption,
  type SelectProps,
  Text,
} from "metabase/ui";

export type BranchFormSelectProps = {
  name: string;
  branches: string[];
  label?: string;
  placeholder?: string;
};

/**
 * A form-bound branch picker. Lists the existing branches and, when the user types a name that doesn't
 * match one, offers a creatable row (`Create branch "<name>"`) so a brand-new branch can be entered.
 * The selected value is always the plain branch name, whether it already exists or is new — callers
 * decide what "new" means by comparing against their own branch list.
 */
export function BranchFormSelect({
  name,
  branches,
  label = t`Branch`,
  placeholder = t`Find or create a branch`,
}: BranchFormSelectProps) {
  const [{ value }, { error, touched }, { setValue, setTouched }] = useField<
    string | null
  >(name);
  const [search, setSearch] = useState(value ?? "");

  const branchSet = useMemo(() => new Set(branches), [branches]);

  const data = useMemo<SelectOption<string>[]>(() => {
    const options = new Map<string, SelectOption<string>>();
    branches.forEach((branch) =>
      options.set(branch, { value: branch, label: branch }),
    );
    // Keep a selected new branch representable so the input can display it.
    if (value && !options.has(value)) {
      options.set(value, { value, label: value });
    }
    const trimmed = search.trim();
    const hasExactMatch = branches.some(
      (branch) => branch.toLowerCase() === trimmed.toLowerCase(),
    );
    if (trimmed && !hasExactMatch && !options.has(trimmed)) {
      options.set(trimmed, { value: trimmed, label: trimmed });
    }
    return [...options.values()];
  }, [branches, search, value]);

  const renderOption: SelectProps<string>["renderOption"] = ({
    option,
    checked,
  }) => {
    if (!branchSet.has(option.value)) {
      return (
        <SelectItem selected={checked}>
          <Icon name="add" flex="0 0 1rem" />
          <Text c="inherit" lh="inherit">
            {t`Create branch "${option.value}"`}
          </Text>
        </SelectItem>
      );
    }
    return <DefaultSelectItem {...option} selected={checked} />;
  };

  return (
    <Select
      name={name}
      label={label}
      placeholder={placeholder}
      data={data}
      value={value ?? null}
      error={touched ? error : null}
      searchable
      searchValue={search}
      nothingFoundMessage={t`No branches found`}
      onSearchChange={setSearch}
      onChange={(newValue) => {
        setValue(newValue ?? null);
        setSearch(newValue ?? "");
      }}
      onBlur={() => setTouched(true)}
      renderOption={renderOption}
      required
    />
  );
}
