import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  HoverParent,
  TableInfoIcon,
} from "metabase/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import AccordionList from "metabase/core/components/AccordionList";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import MetabaseSettings from "metabase/lib/settings";
import { isSyncCompleted } from "metabase/lib/syncing";
import { isNotNull } from "metabase/lib/types";
import { rem, Box, Icon, DelayGroup, Flex } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";

import { DataSelectorSection as Section } from "../DataSelector.styled";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";

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
        type: "back",
      },
    ];

    const checkIfItemIsClickable = ({ table }: { table: Table }) =>
      table && isSyncCompleted(table);

    const checkIfItemIsSelected = ({ table }: { table: Table }) =>
      table && selectedTable ? table.id === selectedTable.id : false;

    const renderItemIcon = ({ table }: { table: Table }) =>
      table ? <TableInfoIcon table={table} position="top-start" /> : null;

    const renderItemWrapper = (content: ReactNode) => (
      <HoverParent>{content}</HoverParent>
    );

    const showSpinner = ({ table }: { table: Table }) =>
      Boolean(table && !isSyncCompleted(table));

    const handleChange = ({ table }: { table: Table }) => onChangeTable(table);

    const isSearchable = hasFiltering && tables.length >= minTablesToShowSearch;

    return (
      <DelayGroup>
        <Box w={rem(300)} style={{ overflowY: "auto" }}>
          <AccordionList
            id="TablePicker"
            key="tablePicker"
            className={CS.textBrand}
            hasInitialFocus={hasInitialFocus}
            sections={sections}
            maxHeight={Infinity}
            width="100%"
            searchable={isSearchable}
            onChange={handleChange}
            showSpinner={showSpinner}
            itemIsSelected={checkIfItemIsSelected}
            itemIsClickable={checkIfItemIsClickable}
            renderItemIcon={renderItemIcon}
            renderItemWrapper={renderItemWrapper}
            showItemArrows={hasNextStep}
          />

          {isSavedQuestionList && (
            <LinkToDocsOnReferencingSavedQuestionsInQueries />
          )}
        </Box>
      </DelayGroup>
    );
  } else {
    return (
      <Section>
        <DataSelectorSectionHeader header={header} />
        <Box p="4rem" ta="center">{t`No tables found in this database.`}</Box>
      </Section>
    );
  }
};

const LinkToDocsOnReferencingSavedQuestionsInQueries = () => (
  <Box
    p="md"
    ta="center"
    bg={color("bg-light")}
    style={{
      borderTop: `1px solid ${color("border")}`,
    }}
  >
    {t`Is a question missing?`}
    <ExternalLink
      // eslint-disable-next-line no-unconditional-metabase-links-render -- It's hard to tell if this is still used in the app. Please see https://metaboat.slack.com/archives/C505ZNNH4/p1703243785315819
      href={MetabaseSettings.docsUrl(
        "questions/native-editor/referencing-saved-questions-in-queries",
      )}
      target="_blank"
      className={cx(CS.block, CS.link)}
    >
      {t`Learn more about nested queries`}
    </ExternalLink>
  </Box>
);

const Header = ({
  onBack,
  schemas,
  selectedDatabase,
  selectedSchema,
}: HeaderProps) => (
  <Flex align="center" wrap="wrap">
    <Flex align="center" style={{ cursor: "pointer" }} onClick={onBack}>
      {onBack && <Icon name="chevronleft" size={18} />}
      <Box component="span" ml="sm" data-testid="source-database">
        {selectedDatabase.name}
      </Box>
    </Flex>

    {selectedSchema?.name && schemas.length > 1 && (
      <>
        <Box component="span" mx="sm" c="text-medium">
          /
        </Box>
        <Box component="span" data-testid="source-schema" c="text-medium">
          {selectedSchema.displayName()}
        </Box>
      </>
    )}
  </Flex>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorTablePicker;
