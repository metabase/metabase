import * as React from "react";
import { t } from "ttag";

import { isSyncCompleted } from "metabase/lib/syncing";

import { Icon, IconName } from "metabase/core/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import Database from "metabase-lib/metadata/Database";
import Schema from "metabase-lib/metadata/Schema";

import DataSelectorLoading from "../DataSelectorLoading";
import { RawDataBackButton } from "../DataSelector.styled";

type DataSelectorDatabaseSchemaPicker = {
  databases: Database[];
  hasBackButton: boolean;
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  selectedDatabase: Database;
  selectedSchema: Schema;
  onBack: () => void;
  onChangeDatabase: (database: Database) => void;
  onChangeSchema: (item: { schema?: Schema }) => void;
};

type Section = {
  name: string | React.ReactElement;
  items?: {
    schema: Schema;
    name: string;
  }[];
  className?: string | null;
  icon?: IconName;
  loading?: boolean;
  active: boolean;
};

type Sections = Section[];

const DataSelectorDatabaseSchemaPicker = ({
  databases,
  selectedDatabase,
  selectedSchema,
  onChangeSchema,
  onChangeDatabase,
  hasNextStep,
  isLoading,
  hasBackButton,
  onBack,
  hasInitialFocus,
}: DataSelectorDatabaseSchemaPicker) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections: Sections = databases.map(database => ({
    name: database.is_saved_questions ? t`Saved Questions` : database.name,
    items:
      !database.is_saved_questions && database.getSchemas().length > 1
        ? database.getSchemas().map(schema => ({
            schema,
            name: schema.displayName() ?? "",
          }))
        : [],
    className: database.is_saved_questions ? "bg-light" : null,
    icon: database.is_saved_questions ? "collection" : "database",
    loading:
      selectedDatabase?.id === database.id &&
      database.getSchemas().length === 0 &&
      isLoading,
    active: database.is_saved_questions || isSyncCompleted(database),
  }));

  const handleChangeSection = (_section: any, sectionIndex: number) => {
    const isNavigationSection = hasBackButton && sectionIndex === 0;

    if (isNavigationSection) {
      onBack();
      return false;
    }

    // the "go back" button is also a section,
    // so need to take its index in mind
    const database = hasBackButton
      ? databases[sectionIndex - 1]
      : databases[sectionIndex];

    onChangeDatabase(database);

    return true;
  };

  const showSpinner = ({ active }: { active?: boolean }) => active === false;

  const renderSectionIcon = ({ icon }: { icon?: IconName }) =>
    icon && <Icon className="Icon text-default" name={icon} size={18} />;

  if (hasBackButton) {
    sections.unshift({
      name: <RawDataBackButton />,
      active: true,
    });
  }

  let openSection = selectedSchema
    ? databases.findIndex(db => db.id === selectedSchema.database?.id)
    : selectedDatabase
    ? databases.findIndex(db => db.id === selectedDatabase.id)
    : -1;

  if (openSection >= 0 && databases[openSection]?.getSchemas().length === 1) {
    openSection = -1;
  }

  return (
    <AccordionList
      id="DatabaseSchemaPicker"
      key="databaseSchemaPicker"
      className="text-brand"
      hasInitialFocus={hasInitialFocus}
      sections={sections}
      onChange={({ schema }: any) => onChangeSchema(schema)}
      onChangeSection={handleChangeSection}
      itemIsSelected={(schema: Schema) => schema === selectedSchema}
      renderSectionIcon={renderSectionIcon}
      renderItemIcon={() => <Icon name="folder" size={16} />}
      initiallyOpenSection={openSection}
      alwaysTogglable={true}
      showSpinner={showSpinner}
      showItemArrows={hasNextStep}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDatabaseSchemaPicker;
