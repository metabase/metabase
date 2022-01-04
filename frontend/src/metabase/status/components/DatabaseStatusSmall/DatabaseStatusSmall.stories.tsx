import React from "react";
import DatabaseStatusSmall from "./DatabaseStatusSmall";
import { createDatabase } from "metabase-types/api/database";

export default {
  title: "Status/DatabaseStatusSmall",
  component: DatabaseStatusSmall,
};

export const Incomplete = () => {
  const database = createDatabase({ initial_sync_status: "incomplete" });
  return <DatabaseStatusSmall databases={[database]} />;
};

export const Complete = () => {
  const database = createDatabase({ initial_sync_status: "complete" });
  return <DatabaseStatusSmall databases={[database]} />;
};

export const Aborted = () => {
  const database = createDatabase({ initial_sync_status: "aborted" });
  return <DatabaseStatusSmall databases={[database]} />;
};
