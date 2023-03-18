import React, { useCallback, useMemo } from "react";

import Icon from "metabase/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";

import type { Database } from "metabase-types/api/database";

import type { Schema } from "../types";
import DataSelectorLoading from "../DataSelectorLoading";
import { RawDataBackButton } from "../DataSelector.styled";

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
      className="text-brand"
      hasInitialFocus={hasInitialFocus}
      sections={sections}
      onChange={(item: Item) => onChangeDatabase(item.database)}
      onChangeSection={handleChangeSection}
      itemIsSelected={(item: Item) =>
        selectedDatabase && item.database.id === selectedDatabase.id
      }
      renderItemIcon={() => (
        <Icon className="Icon text-default" name="database" size={18} />
      )}
      showItemArrows={hasNextStep}
    />
  );
};

export default DataSelectorDatabasePicker;
