import { t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId } from "metabase-types/api";

type DatabasePickerProps = {
  databases: Database[];
  selectedDatabaseId?: DatabaseId;
  onChange?: (databaseId: DatabaseId) => void;
};

const DatabasePicker = ({
  databases,
  selectedDatabaseId,
  onChange,
}: DatabasePickerProps) => {
  const selectedDatabase = databases.find(d => d.id === selectedDatabaseId);
  const label = selectedDatabase ? selectedDatabase.name : t`Pick a database`;

  return (
    <DatabaseDataSelector
      triggerClasses={CS.inline}
      triggerElement={<Button onlyText>{label}</Button>}
      databases={databases}
      selectedDatabaseId={selectedDatabase?.id}
      setDatabaseFn={onChange}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabasePicker;
