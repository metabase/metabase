import React from "react";

import Icon from "metabase/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import DataSelectorLoading from "../DataSelectorLoading";

import { isDatabaseWritebackEnabled } from "metabase/writeback/utils";

import { RawDataBackButton } from "../DataSelector.styled";

import type { Schema } from "../types";
import type { Database } from "metabase-types/api/database";

type DataSelectorDatabasePickerProps = {
  databases: Database[];
  hasBackButton: boolean;
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  requireWriteback: boolean;
  selectedDatabase: Database;
  selectedSchema: Schema;
  onBack?: () => void;
  onChangeDatabase: (database: Database) => void;
  onChangeSchema: (item: { schema?: Schema }) => void;
};

type Item = {
  database: Database;
  index: number;
  name: string;
  writebackEnabled?: boolean;
};

type Section = {
  items: Item[];
};

const DataSelectorDatabasePicker = ({
  databases,
  selectedDatabase,
  onChangeDatabase,
  hasNextStep,
  onBack,
  hasInitialFocus,
  requireWriteback = false,
}: DataSelectorDatabasePickerProps) => {
  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  const sections: Section[] = [
    {
      items: databases.map((database: Database, index: number) => ({
        name: database.name,
        writebackEnabled: isDatabaseWritebackEnabled(database as any),
        index,
        database: database,
      })),
    },
  ];

  const handleChangeSection = (_section: Section, sectionIndex: number) => {
    const isNavigationSection = onBack && sectionIndex === 0;

    if (isNavigationSection) {
      onBack();
    }
    return false;
  };

  if (onBack) {
    sections.unshift({ name: <RawDataBackButton /> } as any);
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
      itemIsClickable={
        requireWriteback ? (item: Item) => item.writebackEnabled : undefined
      }
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
