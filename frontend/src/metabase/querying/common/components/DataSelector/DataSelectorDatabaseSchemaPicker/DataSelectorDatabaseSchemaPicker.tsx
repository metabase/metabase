import cx from "classnames";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import { isSyncCompleted } from "metabase/utils/syncing";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { DatabaseId } from "metabase-types/api";

import { DataSelectorLoading } from "../DataSelectorLoading";
import type { DataSelectorDatabase, DataSelectorSchema } from "../types";

type DataSelectorDatabaseSchemaPicker = {
  databases: DataSelectorDatabase[];
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  selectedDatabase?: DataSelectorDatabase;
  selectedSchema?: DataSelectorSchema;
  onChangeDatabase: (database: DataSelectorDatabase) => void;
  onChangeSchema: (schema?: DataSelectorSchema) => void;
  getDatabaseSchemas: (databaseId: DatabaseId) => DataSelectorSchema[];
};

type Item = {
  schema: DataSelectorSchema;
  name: string;
};

type Section = BaseSection<Item> & {
  active?: boolean;
};

export const DataSelectorDatabaseSchemaPicker = ({
  databases,
  selectedDatabase,
  selectedSchema,
  onChangeSchema,
  onChangeDatabase,
  hasNextStep,
  isLoading,
  hasInitialFocus,
  getDatabaseSchemas,
}: DataSelectorDatabaseSchemaPicker) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections: Section[] = databases.map((database) => {
    const schemas = getDatabaseSchemas(database.id);

    return {
      name: database.name,
      items:
        schemas.length > 1
          ? schemas.map((schema) => ({
              schema,
              name: getSchemaDisplayName(schema.name) ?? "",
            }))
          : [],
      icon: "database",
      loading:
        selectedDatabase?.id === database.id &&
        schemas.length === 0 &&
        isLoading,
      active: isSyncCompleted(database),
    };
  });

  const handleChangeSection = (_section: Section, sectionIndex: number) => {
    onChangeDatabase(databases[sectionIndex]);
    return true;
  };

  const renderSectionIcon = ({ icon }: Section) =>
    icon && (
      <Icon className={cx("Icon", CS.textDefault)} name={icon} size={18} />
    );

  let openSection = selectedSchema
    ? databases.findIndex((db) => db.id === selectedSchema.database)
    : selectedDatabase
      ? databases.findIndex((db) => db.id === selectedDatabase.id)
      : -1;

  const openSectionDatabase = databases[openSection];
  if (
    openSection >= 0 &&
    openSectionDatabase != null &&
    getDatabaseSchemas(openSectionDatabase.id).length === 1
  ) {
    openSection = -1;
  }

  return (
    <AccordionList<Item, Section>
      id="DatabaseSchemaPicker"
      key="databaseSchemaPicker"
      className={CS.textBrand}
      hasInitialFocus={hasInitialFocus}
      sections={sections}
      onChange={({ schema }) => onChangeSchema(schema)}
      onChangeSection={handleChangeSection}
      itemIsSelected={({ schema }) => schema === selectedSchema}
      renderSectionIcon={renderSectionIcon}
      renderItemIcon={() => <Icon name="folder_database" size={16} />}
      initiallyOpenSection={openSection}
      alwaysTogglable={true}
      showSpinner={(itemOrSection) =>
        "active" in itemOrSection && !itemOrSection.active
      }
      showItemArrows={hasNextStep}
      maxHeight={Infinity}
    />
  );
};
