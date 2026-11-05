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
  EntityTypeInput,
  UserInput,
} from "metabase/metadata/components";
import {
  DATA_LAYER_VISIBILITY_ICONS,
  useDataLayers,
} from "metabase/metadata/data-layers";
import { Box, Icon, Select, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table, TableDataSource, UserId } from "metabase-types/api";

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

        <TableDataLayerRow table={table} disabled={readOnly} />

        <DetailsRow
          label={t`Entity type`}
          fillValue
          value={
            <EntityTypeInput
              value={table.entity_type ?? "entity/GenericTable"}
              label={undefined}
              aria-label={t`Entity type`}
              disabled={readOnly}
              onChange={handleEntityTypeChange}
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

// Select value for "no override": the table uses its schema's layer
const SCHEMA_LAYER_VALUE = "schema-layer";

/**
 * PROTOTYPE: mocked. A table uses its schema's data layer unless it overrides
 * it. The real `data_layer` column defaults to "internal", so it can't mean
 * "inherit"; the override lives in the mocked layer store instead.
 */
function TableDataLayerRow({
  table,
  disabled,
}: {
  table: Table;
  disabled: boolean;
}) {
  const {
    getDataLayers,
    getSchemaDataLayer,
    getTableDataLayer,
    setTableDataLayerId,
  } = useDataLayers();
  const schemaLayer = getSchemaDataLayer(table.db_id, table.schema);
  const { layer, isInherited } = getTableDataLayer(
    table.db_id,
    table.schema,
    table.id,
  );

  const options = [
    {
      value: SCHEMA_LAYER_VALUE,
      label: schemaLayer
        ? t`Schema's layer (${schemaLayer.name})`
        : t`Schema's layer`,
    },
    ...getDataLayers(table.db_id).map(({ id, name }) => ({
      value: id,
      label: name,
    })),
  ];

  const handleChange = (value: string | null) => {
    if (value === SCHEMA_LAYER_VALUE) {
      setTableDataLayerId(table.db_id, table.id, null);
    } else if (value != null) {
      setTableDataLayerId(table.db_id, table.id, value);
    }
  };

  return (
    <DetailsRow
      label={t`Data layer`}
      fillValue
      labelNote={
        !isInherited && (
          <Text size="sm" c="text-secondary">
            {t`Overrides the ${table.schema} schema's layer`}
          </Text>
        )
      }
      value={
        <Select
          aria-label={t`Data layer`}
          data={options}
          value={isInherited ? SCHEMA_LAYER_VALUE : (layer?.id ?? null)}
          allowDeselect={false}
          leftSection={
            layer && (
              <Icon name={DATA_LAYER_VISIBILITY_ICONS[layer.visibility]} />
            )
          }
          disabled={disabled}
          classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
          onChange={handleChange}
          data-testid="table-data-layer-input"
        />
      }
    />
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
