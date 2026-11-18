import cx from "classnames";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  DataSourceInput,
  LayerInput,
  UserInput,
} from "metabase/metadata/components";
import { Box, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Table,
  TableDataLayer,
  TableDataSource,
  UserId,
} from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

import S from "./TableAttributesEditSingle.module.css";

interface Props {
  table: Table;
  onUpdate: () => void;
}

export function TableAttributesEditSingle({ table, onUpdate }: Props) {
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
      onUpdate();
      sendSuccessToast(t`Table owner updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          owner_email: table.owner_email,
          owner_user_id: table.owner_user_id,
        });
        if (!error) {
          onUpdate();
        }
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
      onUpdate();
      sendSuccessToast(t`Table owner updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          owner_email: table.owner_email,
          owner_user_id: table.owner_user_id,
        });
        if (!error) {
          onUpdate();
        }
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
      sendErrorToast(t`Failed to update table visibility layer`);
    } else {
      onUpdate();
      sendSuccessToast(t`Table visibility layer updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          data_layer: table.data_layer,
        });
        if (!error) {
          onUpdate();
        }
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

  const isOwnerSpecified = table.owner_email || table.owner_user_id;
  const readOnly = !table.can_write;

  return (
    <SidebarSection title={t`Attributes`}>
      <DetailsTable>
        <DetailsRow
          label={t`Owner`}
          fillValue
          value={
            <UserInput
              email={table.owner_email}
              label={undefined}
              aria-label={t`Owner`}
              userId={isOwnerSpecified ? table.owner_user_id : "unknown"}
              disabled={readOnly}
              onEmailChange={handleOwnerEmailChange}
              onUserIdChange={handleOwnerUserIdChange}
              unknownUserLabel={t`No owner`}
              classNames={{
                ...DETAILS_CELL_INPUT_CLASS_NAMES,
                input: cx(
                  DETAILS_CELL_INPUT_CLASS_NAMES.input,
                  !isOwnerSpecified && S.unset,
                ),
              }}
            />
          }
        />

        <DetailsRow
          label={t`Visibility layer`}
          fillValue
          value={
            <LayerInput
              value={table.data_layer ?? "hidden"}
              label={undefined}
              aria-label={t`Visibility layer`}
              disabled={readOnly}
              onChange={handleLayerChange}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
            />
          }
        />

        <DetailsRow
          label={t`Source`}
          fillValue
          value={
            <DataSourceInput
              disabled={readOnly || table.data_source === "metabase-transform"}
              value={table.data_source ?? "unknown"}
              label={undefined}
              aria-label={t`Source`}
              onChange={handleDataSourceChange}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
            />
          }
        />

        {table.data_source === "metabase-transform" && (
          <DetailsRow
            label={t`Transform`}
            value={<TransformLink table={table} />}
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}

function TransformLink({ table }: { table: Table }) {
  const { transform } = table;

  if (!transform) {
    return (
      <Box c="feedback-negative" fz="sm">
        {t`Transform does not exist anymore`}
      </Box>
    );
  }

  return (
    <Box>
      <Box
        component={Link}
        to={Urls.transform(transform.id)}
        py="xxs"
        px="sm"
        style={{
          borderRadius: 4,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          textDecoration: "none",
        }}
        bg="background_surface-brand-subtle"
        c="core-brand"
      >
        <Icon name="insight" size={12} />
        <Text
          size="sm"
          fw="bold"
          c="core-brand"
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
