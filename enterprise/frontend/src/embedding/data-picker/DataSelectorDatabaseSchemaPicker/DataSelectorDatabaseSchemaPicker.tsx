import cx from "classnames";
import { t } from "ttag";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import type {
  DataSelectorDatabase,
  DataSelectorSchema,
} from "metabase/querying/common/components/DataSelector";
import { Icon } from "metabase/ui";
import { isSyncCompleted } from "metabase/utils/syncing";
import { getSchemaDisplayName } from "metabase-lib/v1/metadata/utils/schema";
import type { DatabaseId } from "metabase-types/api";

import { DataSelectorLoading } from "../DataSelectorLoading";
import { RawDataBackButton } from "../RawDataBackButton";

type DataSelectorDatabaseSchemaPickerProps = {
  databases: DataSelectorDatabase[];
  hasBackButton: boolean;
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  selectedDatabase?: DataSelectorDatabase | null;
  selectedSchema?: DataSelectorSchema | null;
  onBack?: (() => void) | null;
  onChangeDatabase: (database: DataSelectorDatabase) => void;
  onChangeSchema: (schema?: DataSelectorSchema) => void;
  getDatabaseSchemas: (databaseId: DatabaseId) => DataSelectorSchema[];
};

type Item = {
  schema: DataSelectorSchema;
  name: string;
};

type Section = BaseSection<Item> & {
  active: boolean;
};

export const DataSelectorDatabaseSchemaPicker = ({
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
  getDatabaseSchemas,
}: DataSelectorDatabaseSchemaPickerProps) => {
  const tc = useTranslateContent();

  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections: Section[] = databases.map((database) => {
    const schemas = getDatabaseSchemas(database.id);

    return {
      name: database.is_saved_questions
        ? t`Saved Questions`
        : tc(database.name),
      items:
        !database.is_saved_questions && schemas.length > 1
          ? schemas.map((schema) => ({
              schema,
              name: tc(getSchemaDisplayName(schema.name)) ?? "",
            }))
          : [],
      className: database.is_saved_questions ? CS.bgLight : undefined,
      icon: database.is_saved_questions ? "collection" : "database",
      loading:
        selectedDatabase?.id === database.id &&
        schemas.length === 0 &&
        isLoading,
      active: database.is_saved_questions || isSyncCompleted(database),
    };
  });

  const handleChangeSection = (_section: any, sectionIndex: number) => {
    const isNavigationSection = hasBackButton && sectionIndex === 0;

    if (isNavigationSection) {
      onBack?.();
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

  const renderSectionIcon = ({ icon }: Section) =>
    icon ? (
      <Icon className={cx("Icon", CS.textDefault)} name={icon} size={18} />
    ) : null;

  if (hasBackButton) {
    sections.unshift({
      name: <RawDataBackButton />,
      active: true,
      type: "back",
    });
  }

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
      onChange={({ schema }: any) => onChangeSchema(schema)}
      onChangeSection={handleChangeSection}
      itemIsSelected={({ schema }) => schema === selectedSchema}
      renderSectionIcon={renderSectionIcon}
      renderItemIcon={() => <Icon name="folder" size={16} />}
      initiallyOpenSection={openSection}
      alwaysTogglable={true}
      showSpinner={(itemOrSection) =>
        "active" in itemOrSection && itemOrSection.active === false
      }
      showItemArrows={hasNextStep}
      maxHeight={Infinity}
    />
  );
};
