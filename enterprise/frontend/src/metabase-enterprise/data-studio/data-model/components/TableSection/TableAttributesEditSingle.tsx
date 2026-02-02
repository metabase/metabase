import cx from "classnames";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import * as Urls from "metabase/lib/urls";
import {
  DataSourceInput,
  EntityTypeInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Icon, Text } from "metabase/ui";
import type {
  Table,
  TableDataLayer,
  TableDataSource,
  UserId,
} from "metabase-types/api";

import S from "./TableAttributes.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
}

export function TableAttributesEditSingle({ table }: Props) {
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

  const handleLayerChange = async (dataLayer: TableDataLayer | null) => {
    if (dataLayer == null) {
      return; // should never happen as the input is not clearable here
    }

    const { error } = await updateTable({
      id: table.id,
      data_layer: dataLayer,
    });

    if (error) {
      sendErrorToast(t`Failed to update table visibility type`);
    } else {
      sendSuccessToast(t`Table visibility type updated`, async () => {
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

  const isOwnerSpecified = table.owner_email || table.owner_user_id;

  return (
    <TableSectionGroup title={t`Attributes`}>
      <div className={S.container}>
        <UserInput
          email={table.owner_email}
          label={t`Owner`}
          userId={isOwnerSpecified ? table.owner_user_id : "unknown"}
          onEmailChange={handleOwnerEmailChange}
          onUserIdChange={handleOwnerUserIdChange}
          className={S.gridLabelInput}
          unknownUserLabel={t`No owner`}
          classNames={{
            input: cx(S.input, !isOwnerSpecified && S.unset),
            label: S.label,
          }}
        />

        <LayerInput
          value={table.data_layer ?? "copper"}
          onChange={handleLayerChange}
          classNames={{ input: S.input, label: S.label }}
          className={S.gridLabelInput}
        />

        <EntityTypeInput
          value={table.entity_type ?? "entity/GenericTable"}
          onChange={handleEntityTypeChange}
          classNames={{ input: S.input, label: S.label }}
          className={S.gridLabelInput}
        />

        <DataSourceInput
          disabled={table.data_source === "metabase-transform"}
          value={table.data_source ?? "unknown"}
          onChange={handleDataSourceChange}
          classNames={{ input: S.input, label: S.label }}
          className={S.gridLabelInput}
        />

        <TransformLink table={table} />
      </div>
    </TableSectionGroup>
  );
}
function TransformLink({ table }: { table: Table }) {
  const { transform } = table;
  const shouldShowTransform =
    transform !== undefined && table.data_source === "metabase-transform";

  if (!shouldShowTransform) {
    return null;
  }

  return (
    <Box className={S.transformLink}>
      <Box
        component={Link}
        to={Urls.transform(transform.id)}
        py="xs"
        px="sm"
        style={{
          borderRadius: 4,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          textDecoration: "none",
        }}
        bg="background-brand"
        c="brand"
      >
        <Icon name="insight" size={12} />
        <Text
          size="sm"
          fw="bold"
          c="brand"
          style={{
            fontSize: 12,
            lineHeight: "16px",
          }}
        >
          {transform.name}
        </Text>
      </Box>
    </Box>
  );
}
