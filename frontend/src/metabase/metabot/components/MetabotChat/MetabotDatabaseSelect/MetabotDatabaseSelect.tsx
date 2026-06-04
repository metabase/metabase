import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { getEngineLogo } from "metabase/databases/utils/engine";
import { Group, Icon, Select, type SelectProps } from "metabase/ui";
import type { Database } from "metabase-types/api";

import S from "./MetabotDatabaseSelect.module.css";

type MetabotDatabaseSelectProps = {
  value: number | undefined;
  onChange: (databaseId: number | undefined) => void;
  disabled?: boolean;
};

const ICON_SIZE = 14;

const EngineIcon = ({ engine }: { engine: string | undefined }) => {
  const logo = engine ? getEngineLogo(engine) : undefined;
  if (logo) {
    return (
      <img
        className={S.engineLogo}
        src={logo}
        width={ICON_SIZE}
        height={ICON_SIZE}
        alt=""
      />
    );
  }
  return <Icon name="database" size={ICON_SIZE} />;
};

export const MetabotDatabaseSelect = ({
  value,
  onChange,
  disabled,
}: MetabotDatabaseSelectProps) => {
  const { data, isLoading } = useListDatabasesQuery();
  const databases: Database[] = useMemo(() => data?.data ?? [], [data]);

  const engineByValue = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const db of databases) {
      map[String(db.id)] = db.engine;
    }
    return map;
  }, [databases]);

  const options = useMemo(
    () => databases.map((db) => ({ value: String(db.id), label: db.name })),
    [databases],
  );

  useEffect(
    function autoSelectFirstPostgres() {
      if (value != null || isLoading || databases.length === 0) {
        return;
      }
      const firstPostgres = databases.find((db) => db.engine === "postgres");
      if (firstPostgres) {
        onChange(firstPostgres.id);
      }
    },
    [databases, isLoading, onChange, value],
  );

  const selectedValue = value != null ? String(value) : null;

  const renderOption: SelectProps["renderOption"] = ({ option }) => (
    <Group gap="sm">
      <EngineIcon engine={engineByValue[option.value]} />
      {option.label}
    </Group>
  );

  return (
    <Select
      data-testid="metabot-database-selector"
      data={options}
      value={selectedValue}
      onChange={(next) => onChange(next != null ? Number(next) : undefined)}
      disabled={disabled || isLoading}
      placeholder={isLoading ? t`Loading…` : t`Select database`}
      rightSection={<Icon size="0.5rem" name="chevrondown" />}
      rightSectionWidth="1rem"
      comboboxProps={{ position: "top" }}
      renderOption={renderOption}
      classNames={{
        root: S.root,
        wrapper: S.wrapper,
        input: S.input,
        section: S.section,
        dropdown: S.dropdown,
        option: S.option,
      }}
    />
  );
};
