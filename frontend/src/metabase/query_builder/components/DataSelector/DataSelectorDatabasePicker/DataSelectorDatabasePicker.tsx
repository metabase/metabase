import cx from "classnames";
import { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";

import { RawDataBackButton } from "../DataSelector.styled";
import DataSelectorLoading from "../DataSelectorLoading";

type DataSelectorDatabasePickerProps = {
  databases: Database[];
  hasBackButton?: boolean;
  hasFiltering?: boolean;
  hasInitialFocus?: boolean;
  hasNextStep?: boolean;
  isLoading?: boolean;
  selectedDatabase?: Database;
  selectedSchema?: Schema;
  onBack?: () => void;
  onChangeDatabase: (database: Database) => void;
  onChangeSchema: (item: { schema?: Schema }) => void;
};

type Item = {
  name: string;
  index: number;
  database: Database;
};

type Section = {
  name?: JSX.Element;
  items?: Item[];
};

const DataSelectorDatabasePicker = ({
  databases,
  selectedDatabase,
  onChangeDatabase,
  hasNextStep,
  onBack,
  hasInitialFocus,
}: DataSelectorDatabasePickerProps) => {
  const sections = useMemo(() => {
    const sections: Section[] = [];

    if (onBack) {
      sections.push({ name: <RawDataBackButton /> });
    }

    sections.push({
      items: databases.map((database, index) => ({
        name: database.name,
        index,
        database,
      })),
    });

    return sections;
  }, [databases, onBack]);

  const handleChangeSection = useCallback(
    (section: Section, sectionIndex: number) => {
      const isNavigationSection = onBack && sectionIndex === 0;
      if (isNavigationSection) {
        onBack();
      }
      return false;
    },
    [onBack],
  );

  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  return (
    <AccordionList
      id="DatabasePicker"
      key="databasePicker"
      className={CS.textBrand}
      hasInitialFocus={hasInitialFocus}
      sections={sections}
      onChange={(item: Item) => onChangeDatabase(item.database)}
      onChangeSection={handleChangeSection}
      itemIsSelected={(item: Item) =>
        selectedDatabase && item.database.id === selectedDatabase.id
      }
      renderItemIcon={() => (
        <Icon
          className={cx("Icon", CS.textDefault)}
          name="database"
          size={18}
        />
      )}
      showItemArrows={hasNextStep}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorDatabasePicker;
