import React from "react";

import Database from "metabase/entities/databases";
import type { Database as DatabaseType } from "metabase-types/types/Database";

import SettingSelect from "../SettingSelect";

const getDatabaseOptions = (databases: DatabaseType[]) =>
  databases
    .filter(db => db?.settings?.["database-enable-actions"])
    .map(db => ({ name: db.name, value: db.id }));

interface UploadSettingProps {
  databases: DatabaseType[];
  setting: any;
  onChange: (value: number) => void;
}

function UploadDbWidgetView({
  databases,
  setting,
  onChange,
}: UploadSettingProps) {
  const databaseOptions = getDatabaseOptions(databases);
  if (!databaseOptions?.length) {
    return null;
  }

  return (
    <SettingSelect
      setting={{
        ...setting,
        options: databaseOptions,
      }}
      onChange={(dbId: number) => onChange(dbId)}
    />
  );
}

export const UploadDbWidget = Database.loadList()(UploadDbWidgetView);
