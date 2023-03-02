import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { t } from "ttag";
import Papa from "papaparse";

import {
  syncDatabaseSchema,
  rescanDatabaseFields,
} from "metabase/admin/databases/database";
import type { Database } from "metabase-types/api";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { MetabaseApi } from "metabase/services";

import {
  TableGridItem,
  TableCard,
  AddTableButton,
  LoadingStateContainer,
} from "./TableBrowser.styled";

import { detectSchema, formatInsertData } from "./utils";

export function AddTable({
  database,
  schemaName,
}: {
  database: Database;
  schemaName: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isUploaded] = useState(false);
  const [tableName] = useState("");
  const [tableId] = useState(0);

  const dispatch = useDispatch();

  // TODO: get from settings for white-labeled instances
  const loadingMessage = t`Doing Science ...`;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      setIsLoading(true);

      const name = file.name.replace(/.csv/i, "");

      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: async function (results: any) {
          const schema = detectSchema(results.data);
          const { columns, rows } = formatInsertData(results.data);

          const createResponse = await MetabaseApi.db_table_create({
            db_id: database.id,
            name: name,
            schema,
          }).catch(() => ({ id: "oops" }));

          await MetabaseApi.db_table_insert({
            tableId: createResponse.id,
            columns,
            values: rows,
          }).catch(() => ({ table_id: "oops" }));

          // 🤫
          await syncDatabaseSchema(database.id)(dispatch);
          await rescanDatabaseFields(database.id)(dispatch);

          setTimeout(() => {
            // there's not currently a way to refresh the fields for a table
            // without reloading the page
            window.location.reload();
          }, 1000);
        },
      });
    }
  };

  if (isUploaded) {
    return (
      <TableGridItem>
        <TableCard>
          <Link to={`/question#?db=${database.id}&table=${tableId}`}>
            <AddTableButton isLoading={false}>
              <Icon name="check" size={18} color={color("accent1")} />
              <span> {tableName} </span>
            </AddTableButton>
          </Link>
        </TableCard>
      </TableGridItem>
    );
  }

  if (isLoading) {
    return (
      <TableGridItem>
        <TableCard>
          <AddTableButton isLoading={false}>
            <LoadingStateContainer>
              <LoadingSpinner size={18} />
            </LoadingStateContainer>
            <span> {loadingMessage} </span>
          </AddTableButton>
        </TableCard>
      </TableGridItem>
    );
  }

  return (
    <TableGridItem>
      <TableCard>
        <AddTableButton isLoading={isLoading}>
          <Icon name="add" size={18} color={color("brand")} />
          <span> Add Table </span>
          <input type="file" accept="text/csv" onChange={handleFileUpload} />
        </AddTableButton>
      </TableCard>
    </TableGridItem>
  );
}
