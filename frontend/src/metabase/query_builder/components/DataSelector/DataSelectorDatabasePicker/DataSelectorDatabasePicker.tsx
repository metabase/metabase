import cx from "classnames";
import { useCallback, useMemo } from "react";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";

import { DataSelectorLoading } from "../DataSelectorLoading";
import { RawDataBackButton } from "../RawDataBackButton";

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
  databaseIsDisabled?: (database: Database) => boolean;
};

type Item = {
  name: string;
  index: number;
  database: Database;
};

export const DataSelectorDatabasePicker = ({
  databases,
  selectedDatabase,
  onChangeDatabase,
  hasNextStep,
  onBack,
  hasInitialFocus,
  databaseIsDisabled,
}: DataSelectorDatabasePickerProps) => {
  const sections = useMemo(() => {
    const sections: Section<Item>[] = [];

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
    (_section: Section<Item>, sectionIndex: number) => {
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
    <AccordionList<Item>
      id="DatabasePicker"
      key="databasePicker"
      className={CS.textBrand}
      hasInitialFocus={hasInitialFocus}
      sections={sections}
      globalSearch={true}
      onChange={(item: Item) => onChangeDatabase(item.database)}
      onChangeSection={handleChangeSection}
      itemIsClickable={(item: Item) => !databaseIsDisabled?.(item.database)}
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
      maxHeight={Infinity}
    />
  );
};
