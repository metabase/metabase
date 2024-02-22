import type { CSSProperties, ReactNode } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Icon } from "metabase/ui";
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
  isMantine = false,
}: {
  className?: string;
  style?: CSSProperties;
  showDropdownIcon?: boolean;
  iconSize?: number;
  isMantine?: boolean;
  children: ReactNode;
}) {
  if (isMantine) {
    return (
      <TriggerContainer>
        {children}
        {showDropdownIcon && (
          <TriggerContainerIcon>
            <Icon name="chevrondown" size={iconSize} />
          </TriggerContainerIcon>
        )}
      </TriggerContainer>
    );
  }

  return (
    <span
      className={className || "px2 py2 text-bold cursor-pointer text-default"}
      style={style}
    >
      {children}
      {showDropdownIcon && (
        <Icon className="ml1" name="chevrondown" size={iconSize} />
      )}
    </span>
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
    return (
      <span className="flex-full text-medium no-decoration">{t`Select...`}</span>
    );
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
