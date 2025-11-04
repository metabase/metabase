import { useState } from "react";
import { t } from "ttag";

import { useEditTablesMutation } from "metabase/api";
import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box } from "metabase/ui";
import type {
  TableDataLayer,
  TableDataSource,
  UserId,
} from "metabase-types/api";

import { useSelection } from "../../contexts/SelectionContext";

import S from "./TableMetadataSection.module.css";

export function EditTableMetadata() {
  const { selectedTables, selectedSchemas, selectedDatabases } = useSelection();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [editTables] = useEditTablesMutation();
  const [dataLayer, setDataLayer] = useState<TableDataLayer | null>(null);
  const [dataSource, setDataSource] = useState<
    TableDataSource | "unknown" | null
  >(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<UserId | "unknown" | null>(null);

  const handleSubmit = async ({
    dataLayer,
    dataSource,
    email,
    userId,
  }: {
    dataLayer?: TableDataLayer | null;
    dataSource?: TableDataSource | "unknown" | null;
    email?: string | null;
    userId?: UserId | "unknown" | null;
  }) => {
    const { error } = await editTables({
      table_ids: Array.from(selectedTables),
      schema_ids: Array.from(selectedSchemas),
      database_ids: Array.from(selectedDatabases),
      data_layer: dataLayer ?? undefined,
      data_source: dataSource === "unknown" ? null : (dataSource ?? undefined),
      owner_email:
        userId === "unknown" || typeof userId === "number"
          ? null
          : (email ?? undefined),
      owner_user_id: userId === "unknown" ? null : (userId ?? undefined),
    });

    // onUpdate?.();

    if (error) {
      sendErrorToast(t`Failed to update items`);
    } else {
      sendSuccessToast(t`Items updated`);
    }

    if (dataLayer) {
      setDataLayer(dataLayer);
    }
    if (dataSource) {
      setDataSource(dataSource);
    }
    if (email) {
      setEmail(email);
    }
    if (userId) {
      setUserId(userId);
    }
  };

  return (
    <Box p="xl" className={S.container}>
      <LayerInput
        clearable
        value={dataLayer}
        onChange={(newDataLayer) => handleSubmit({ dataLayer: newDataLayer })}
        className={S.gridLabelInput}
        styles={{
          label: {
            gridColumn: 1,
            fontWeight: "normal",
          },
          input: {
            gridColumn: 2,
          },
        }}
      />

      <UserInput
        clearable
        email={email}
        label={t`Owner`}
        userId={userId}
        onEmailChange={(newEmail) => {
          handleSubmit({ email: newEmail });
        }}
        onUserIdChange={(newUserId) => {
          handleSubmit({ userId: newUserId });
        }}
        className={S.gridLabelInput}
        styles={{
          label: {
            gridColumn: 1,
            fontWeight: "normal",
          },
          input: {
            gridColumn: 2,
          },
        }}
      />

      <DataSourceInput
        clearable
        value={dataSource}
        onChange={(newDataSource) =>
          handleSubmit({ dataSource: newDataSource })
        }
        className={S.gridLabelInput}
        styles={{
          label: {
            gridColumn: 1,
            fontWeight: "normal",
          },
          input: {
            gridColumn: 2,
          },
        }}
      />
    </Box>
  );
}
