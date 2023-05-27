import React from "react";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import { isSyncCompleted } from "metabase/lib/syncing";

import Icon from "metabase/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import ExternalLink from "metabase/core/components/ExternalLink";
import { isNotNull } from "metabase/core/utils/types";
import type Database from "metabase-lib/metadata/Database";
import type Schema from "metabase-lib/metadata/Schema";
import type Table from "metabase-lib/metadata/Table";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";

import { DataSelectorSection as Section } from "../DataSelector.styled";
import {
  DataSelectorTablePickerContainer as Container,
  DataSelectorTablePickerHeaderContainer as HeaderContainer,
  DataSelectorTablePickerHeaderClickable as HeaderClickable,
  DataSelectorTablePickerHeaderDatabaseName as HeaderDatabaseName,
  DataSelectorTablePickerHeaderSchemaName as HeaderSchemaName,
  LinkToDocsContainer,
  NoTablesFound,
} from "./DataSelectorTablePicker.styled";

type DataSelectorTablePickerProps = {
  hasFiltering?: boolean;
  hasInitialFocus?: boolean;
  hasNextStep?: boolean;
  isLoading?: boolean;
  minTablesToShowSearch?: number;
  schemas: Schema[];
  selectedDatabase: Database;
  selectedSchema?: Schema;
  selectedTable?: Table;
  tables: Table[];
  onBack?: () => void;
  onChangeTable: (table: Table) => void;
};

type HeaderProps = Pick<
  DataSelectorTablePickerProps,
  "schemas" | "selectedSchema" | "selectedDatabase" | "onBack"
>;

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
        items: tables.filter(isNotNull).map(table => ({
          name: table.displayName(),
          table: table,
          database: selectedDatabase,
        })),
        loading: tables.length === 0 && isLoading,
      },
    ];

    const checkIfItemIsClickable = ({ table }: { table: Table }) =>
      table && isSyncCompleted(table);

    const checkIfItemIsSelected = ({ table }: { table: Table }) =>
      table && selectedTable ? table.id === selectedTable.id : false;

    const renderItemIcon = ({ table }: { table: Table }) =>
      table ? <Icon name="table" /> : null;

    const handleChange = ({ table }: { table: Table }) => onChangeTable(table);

    const isSearchable = hasFiltering && tables.length >= minTablesToShowSearch;

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
          searchable={isSearchable}
          onChange={handleChange}
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
    return (
      <Section>
        <DataSelectorSectionHeader header={header} />
        <NoTablesFound>{t`No tables found in this database.`}</NoTablesFound>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorTablePicker;
