import { t } from "ttag";

import {
  usePublishModelsMutation,
  useUpdateTableFieldsOrderMutation,
  useUpdateTableMutation,
} from "metabase/api";
import {
  ActiveInput,
  DataSourceInput,
  EntityTypeInput,
  FieldOrderPicker,
  LayerInput,
  NameDescriptionInput,
  SortableFieldList,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack, Title } from "metabase/ui";
import type {
  FieldId,
  Table,
  TableDataSource,
  TableFieldOrder,
  TableVisibilityType2,
  UserId,
} from "metabase-types/api";

import S from "./TableMetadataSection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
}

export function TableMetadataSection({ table }: Props) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const handleOwnerEmailChange = async (email: string | null) => {
    const { error } = await updateTable({
      id: table.id,
      owner_email: email,
      owner_user_id: null,
    });

    if (error) {
      sendErrorToast(t`Failed to update table owner`);
    } else {
      sendSuccessToast(t`Table owner updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          owner_email: table.owner_email,
          owner_user_id: table.owner_user_id,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleOwnerUserIdChange = async (userId: UserId | "unknown" | null) => {
    if (userId == null) {
      return; // should never happen as the input is not clearable here
    }

    const { error } = await updateTable({
      id: table.id,
      owner_email: null,
      owner_user_id: userId === "unknown" ? null : userId,
    });

    if (error) {
      sendErrorToast(t`Failed to update table owner`);
    } else {
      sendSuccessToast(t`Table owner updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          owner_email: table.owner_email,
          owner_user_id: table.owner_user_id,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleLayerChange = async (
    visibilityType: TableVisibilityType2 | null,
  ) => {
    if (visibilityType == null) {
      return; // should never happen as the input is not clearable here
    }

    const { error } = await updateTable({
      id: table.id,
      data_layer: visibilityType,
    });

    if (error) {
      sendErrorToast(t`Failed to update table layer`);
    } else {
      sendSuccessToast(t`Table layer updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          data_layer: table.data_layer,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDataSourceChange = async (
    dataSource: TableDataSource | "unknown" | null,
  ) => {
    if (dataSource == null) {
      return; // should never happen as the input is not clearable here
    }

    const { error } = await updateTable({
      id: table.id,
      data_source: dataSource === "unknown" ? null : dataSource,
    });

    if (error) {
      sendErrorToast(t`Failed to update table data source`);
    } else {
      sendSuccessToast(t`Table data source updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          data_source: table.data_source,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleEntityTypeChange = async (entityType: Table["entity_type"]) => {
    const { error } = await updateTable({
      id: table.id,
      entity_type: entityType,
    });

    if (error) {
      sendErrorToast(t`Failed to update entity type`);
    } else {
      sendSuccessToast(t`Entity type updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          entity_type: table.entity_type,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <TableSectionGroup title={t`Settings`}>
      <div className={S.container}>
        <UserInput
          email={table.owner_email}
          label={t`Owner`}
          userId={
            !table.owner_email && !table.owner_user_id
              ? "unknown"
              : table.owner_user_id
          }
          onEmailChange={handleOwnerEmailChange}
          onUserIdChange={handleOwnerUserIdChange}
          styles={{
            label: {
              gridColumn: 1,
              fontWeight: "normal",
            },
            input: {
              gridColumn: 2,
            },
          }}
          className={S.gridLabelInput}
        />

        <LayerInput
          value={table.data_layer ?? "copper"}
          onChange={handleLayerChange}
          styles={{
            label: {
              gridColumn: 1,
              fontWeight: "normal",
            },
            input: {
              gridColumn: 2,
            },
          }}
          className={S.gridLabelInput}
        />

        <EntityTypeInput
          value={table.entity_type ?? "entity/GenericTable"}
          onChange={handleEntityTypeChange}
          styles={{
            label: {
              gridColumn: 1,
              fontWeight: "normal",
            },
            input: {
              gridColumn: 2,
            },
          }}
          className={S.gridLabelInput}
        />

        <DataSourceInput
          transformId={table.transform_id}
          value={table.data_source ?? "unknown"}
          onChange={handleDataSourceChange}
          styles={{
            label: {
              gridColumn: 1,
              fontWeight: "normal",
            },
            input: {
              gridColumn: 2,
            },
          }}
          className={S.gridLabelInput}
        />

        {/* <ActiveInput
          value={table.active}
          styles={{
            label: {
              gridColumn: 1,
              fontWeight: "normal",
            },
            input: {
              gridColumn: 2,
            },
          }}
          className={S.gridLabelInput}
        /> */}
      </div>
    </TableSectionGroup>
  );
}
