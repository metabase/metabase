import React, { useState } from "react";
import { t } from "ttag";
import Papa from "papaparse";

import type { Database } from "metabase-types/api";
import Icon from "metabase/components/Icon";
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

export function AddTable({ database }: { database: Database }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [tableName, setTableName] = useState("");

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

          console.log({ createResponse });

          const insertResponse = await MetabaseApi.db_table_insert({
            tableId: createResponse.id,
            columns,
            values: rows,
          }).catch(() => ({ table_id: "oops" }));

          console.log({ insertResponse });

          setTimeout(() => {
            // this is just for show ;-)
            setTableName(name);
            setIsLoading(false);
            setIsUploaded(true);
          }, 2000);
        },
      });
    }
  };

  if (isUploaded) {
    return (
      <TableGridItem>
        <TableCard>
          <AddTableButton isLoading={false}>
            <Icon name="check" size={18} color={color("accent1")} />
            <span> {tableName} </span>
          </AddTableButton>
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
