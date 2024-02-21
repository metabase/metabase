import type { CSSProperties, ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Icon, Text } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";
import type Field from "metabase-lib/metadata/Field";
import type Table from "metabase-lib/metadata/Table";

import { TriggerContainer, TriggerContainerIcon } from "./DataSelector.styled";

export function Trigger({
  className,
  style,
  showDropdownIcon = false,
  iconSize = 8,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  showDropdownIcon?: boolean;
  iconSize?: number;
  mantine?: boolean;
  children: ReactNode;
}) {
  const icon = showDropdownIcon && <Icon name="chevrondown" size={iconSize} />;

  if (style || className) {
    return (
      <span
        className={className || "px2 py2 text-bold cursor-pointer text-default"}
        style={style}
      >
        {children}
        {icon}
      </span>
    );
  }

  return (
    <TriggerContainer>
      {children}
      {icon && <TriggerContainerIcon>{icon}</TriggerContainerIcon>}
    </TriggerContainer>
  );
}

export function FieldTrigger({
  database,
  field,
}: {
  database: Database;
  field: Field;
}) {
  if (!field || !field.table) {
    return <Text w="100%">{t`Select...`}</Text>;
  }
  const hasMultipleSchemas =
    _.uniq(database?.tables ?? [], t => t.schema_name).length > 1;
  return (
    <div className="flex-full cursor-pointer">
      <div className="h6 text-bold text-uppercase text-light">
        {hasMultipleSchemas && field.table.schema_name + " > "}
        {field.table.display_name}
      </div>
      <div className="h4 text-bold text-default">{field.display_name}</div>
    </div>
  );
}

export function DatabaseTrigger({ database }: { database: Database }) {
  return database ? (
    <span className="text-wrap text-grey no-decoration">{database.name}</span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a database`}</span>
  );
}

export function TableTrigger({ table }: { table: Table }) {
  return table ? (
    <span className="text-wrap text-grey no-decoration">
      {table.display_name || table.name}
    </span>
  ) : (
    <span className="text-medium no-decoration">{t`Select a table`}</span>
  );
}
