import React from "react";

import { alpha } from "metabase/lib/colors";

import WorksheetSection from "./WorksheetSection";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import SECTIONS from "./style";

const COLOR = SECTIONS.data.color;

const DataSection = ({
  databases,
  query,
  setDatabaseFn,
  setSourceTableFn,
  style,
  className,
  footerButtons,
  children,
}) => {
  const databaseId = query.databaseId();
  const tableId = query.tableId();
  const isInitiallyOpen = tableId == null || databaseId == null;
  return (
    <WorksheetSection
      {...SECTIONS.data}
      style={style}
      className={className}
      header={
        <DatabaseSchemaAndTableDataSelector
          className="rounded py1 px2 text-brand h3"
          style={{ backgroundColor: alpha(SECTIONS.data.color, 0.2) }}
          triggerClasses="ml4"
          databases={databases}
          selectedDatabaseId={databaseId}
          selectedTableId={tableId}
          setDatabaseFn={setDatabaseFn}
          setSourceTableFn={setSourceTableFn}
          isInitiallyOpen={isInitiallyOpen}
          tetherOptions={{
            attachment: "top left",
            targetAttachment: "bottom left",
            targetOffset: "15px 0",
          }}
          hasArrow={false}
        />
      }
      footerButtons={footerButtons}
    >
      {children}
    </WorksheetSection>
  );
};

export default DataSection;
