import React from "react";
import cx from "classnames";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import { isSyncCompleted } from "metabase/lib/syncing";

import Icon from "metabase/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import ExternalLink from "metabase/core/components/ExternalLink";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";

import {
  DataSelectorTablePickerContainer as Container,
  DataSelectorTablePickerSection as Section,
  DataSelectorTablePickerHeaderContainer as HeaderContainer,
  DataSelectorTablePickerHeaderClickable as HeaderClickable,
  DataSelectorTablePickerHeaderDatabaseName as HeaderDatabaseName,
  DataSelectorTablePickerHeaderSchemaName as HeaderSchemaName,
  LinkToDocsContainer,
} from "./DataSelectorTablePicker.styled";

import type { Database } from "metabase-types/api/database";
import type Schema from "metabase-lib/lib/metadata/Schema";
import type Table from "metabase-lib/lib/metadata/Table";

type DataSelectorTablePickerProps = {
  hasFiltering: boolean;
  hasInitialFocus: boolean;
  hasNextStep: boolean;
  isLoading: boolean;
  minTablesToShowSearch: number;
  schemas: Schema[];
  selectedDatabase: Database;
  selectedSchema: Schema;
  selectedTable: Table;
  tables: Table[];
  onBack?: () => void;
  onChangeTable: (table: Table) => void;
};

type HeaderProps = Pick<
  DataSelectorTablePickerProps,
  "schemas" | "selectedSchema" | "selectedDatabase" | "onBack"
>;

type Item = {
  table: Table;
};

const DataSelectorTablePicker = ({
  schemas,
  tables,
  selectedDatabase,
  selectedSchema,
  selectedTable,
  onChangeTable,
  hasNextStep,
  onBack,
  isLoading,
  hasFiltering,
  minTablesToShowSearch = 10,
  hasInitialFocus,
}: DataSelectorTablePickerProps) => {
  // In case DataSelector props get reset
  if (!selectedDatabase) {
    if (onBack) {
      onBack();
    }
    return null;
  }

  const isSavedQuestionList = selectedDatabase.is_saved_questions;

  const header = (
    <Header
      onBack={onBack}
      schemas={schemas}
      selectedDatabase={selectedDatabase}
      selectedSchema={selectedSchema}
    />
  );

  if (tables.length > 0 || isLoading) {
    const sections = [
      {
        name: header,
        items: tables.filter(Boolean).map(table => ({
          name: table.displayName(),
          table: table,
          database: selectedDatabase,
        })),
        loading: tables.length === 0 && isLoading,
      },
    ];

    const checkIfItemIsClickable = (item: Item) =>
      item.table && isSyncCompleted(item.table);

    const checkIfItemIsSelected = (item: Item) =>
      item.table && selectedTable ? item.table.id === selectedTable.id : false;

    const renderItemIcon = (item: Item) =>
      item.table ? <Icon name="table2" size={18} /> : null;

    return (
      <Container>
        <AccordionList
          id="TablePicker"
          key="tablePicker"
          className="text-brand"
          hasInitialFocus={hasInitialFocus}
          sections={sections}
          maxHeight={Infinity}
          width="100%"
          searchable={hasFiltering && tables.length >= minTablesToShowSearch}
          onChange={(item: Item) => onChangeTable(item.table)}
          itemIsSelected={checkIfItemIsSelected}
          itemIsClickable={checkIfItemIsClickable}
          renderItemIcon={renderItemIcon}
          showItemArrows={hasNextStep}
        />

        {isSavedQuestionList && (
          <LinkToDocsOnReferencingSavedQuestionsInQueries />
        )}
      </Container>
    );
  } else {
    // this is a database with no tables!
    return (
      <Section>
        <DataSelectorSectionHeader header={header} />
        <div className="p4 text-centered">{t`No tables found in this database.`}</div>
      </Section>
    );
  }
};

const LinkToDocsOnReferencingSavedQuestionsInQueries = () => (
  <LinkToDocsContainer>
    {t`Is a question missing?`}
    <ExternalLink
      href={MetabaseSettings.docsUrl(
        "questions/native-editor/referencing-saved-questions-in-queries",
      )}
      target="_blank"
      className="block link"
    >
      {t`Learn more about nested queries`}
    </ExternalLink>
  </LinkToDocsContainer>
);

const Header = ({
  onBack,
  schemas,
  selectedDatabase,
  selectedSchema,
}: HeaderProps) => (
  <HeaderContainer>
    <HeaderClickable onClick={onBack}>
      {onBack && <Icon name="chevronleft" size={18} />}
      <HeaderDatabaseName>{selectedDatabase.name}</HeaderDatabaseName>
    </HeaderClickable>

    {selectedSchema?.name && schemas.length > 1 && (
      <HeaderSchemaName>- {selectedSchema.displayName()}</HeaderSchemaName>
    )}
  </HeaderContainer>
);

export default DataSelectorTablePicker;
