import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { MultiAutocompleteWithTranslation } from "metabase/common/components/MultiAutocomplete";
import { type ComboboxItem, Flex, Icon, Tooltip } from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

import S from "./DatabaseMultiSelect.module.css";

export interface DatabaseMultiSelectProps {
  value: DatabaseId[];
  onChange: (value: DatabaseId[]) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  "data-testid"?: string;

  /** Callback to determine if a database option should be disabled */
  isOptionDisabled?: (database: Database) => boolean;

  /** Tooltip text to show for disabled options */
  disabledOptionTooltip?: string;
}

export const DatabaseMultiSelect = ({
  value,
  onChange,
  placeholder = t`Pick a database`,
  label,
  description,
  disabled,
  "data-testid": dataTestId,
  isOptionDisabled,
  disabledOptionTooltip,
}: DatabaseMultiSelectProps) => {
  const { data: databasesResponse } = useListDatabasesQuery();

  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse?.data],
  );

  const databaseIds = useMemo(() => value.map(String), [value]);

  const options = useMemo(() => {
    return databases.map((db) => ({
      value: String(db.id),
      label: db.name,
      disabled: isOptionDisabled?.(db) ?? false,
    }));
  }, [databases, isOptionDisabled]);

  const handleChange = (databaseIds: string[]) =>
    onChange(databaseIds.map(Number));

  const renderValue = ({ value }: { value: string }) => {
    const database = databases.find((db) => db.id.toString() === value);

    if (!database) {
      return value;
    }

    return (
      <Flex align="center" gap="sm" className={S.pillContent}>
        <Icon name="database" size={16} />
        {database.name}
      </Flex>
    );
  };

  const renderOption = ({ option }: { option: ComboboxItem }) => {
    const isDisabled = option.disabled;

    return (
      <Flex align="center" gap="sm" className={S.optionContent}>
        <Icon name="database" size={16} className={S.optionIcon} />
        {option.label}

        {isDisabled && disabledOptionTooltip && (
          <Tooltip label={disabledOptionTooltip} position="top">
            <Icon name="info" size={16} className={S.disabledInfoIcon} />
          </Tooltip>
        )}
      </Flex>
    );
  };

  return (
    <MultiAutocompleteWithTranslation
      value={databaseIds}
      data={options}
      placeholder={placeholder}
      label={label}
      description={description}
      nothingFoundMessage={t`No databases found`}
      classNames={{ input: S.input }}
      comboboxProps={{ disabled }}
      data-testid={dataTestId}
      rightSection={null}
      renderValue={renderValue}
      renderOption={renderOption}
      onChange={handleChange}
    />
  );
};
