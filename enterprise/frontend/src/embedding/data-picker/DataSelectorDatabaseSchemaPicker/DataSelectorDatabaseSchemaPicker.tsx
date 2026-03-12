import cx from "classnames";
import { t } from "ttag";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { useTranslateContent } from "metabase/i18n/hooks";
import { isSyncCompleted } from "metabase/lib/syncing";
import { Icon } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";

import DataSelectorLoading from "../DataSelectorLoading";
import { RawDataBackButton } from "../RawDataBackButton";

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

type Item = {
  schema: Schema;
  name: string;
};

type Section = BaseSection<Item> & {
  active: boolean;
};

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
  const tc = useTranslateContent();

  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections: Section[] = databases.map((database) => ({
    name: database.is_saved_questions ? t`Saved Questions` : tc(database.name),
    items:
      !database.is_saved_questions && database.getSchemas().length > 1
        ? database.getSchemas().map((schema) => ({
            schema,
            name: tc(schema.displayName()) ?? "",
          }))
        : [],
    className: database.is_saved_questions ? CS.bgLight : undefined,
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
    ? databases.findIndex((db) => db.id === selectedSchema.database?.id)
    : selectedDatabase
      ? databases.findIndex((db) => db.id === selectedDatabase.id)
      : -1;

  if (openSection >= 0 && databases[openSection]?.getSchemas().length === 1) {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDatabaseSchemaPicker;
