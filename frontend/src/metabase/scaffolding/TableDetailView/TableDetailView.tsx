import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { useGetTableQueryMetadataQuery } from "metabase/api/table";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Stack, Text } from "metabase/ui/components";
import { ActionIcon, Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import { ObjectDetailBody } from "metabase/visualizations/components/ObjectDetail/ObjectDetailBody";
import {
  CloseButton,
  ObjectDetailHeaderWrapper,
  ObjectIdLabel,
} from "metabase/visualizations/components/ObjectDetail/ObjectDetailHeader.styled";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type { StructuredDatasetQuery } from "metabase-types/api";

interface TableDetailViewProps {
  params: {
    tableId: string;
  };
  isEdit?: boolean;
}

export function TableDetailView(props: TableDetailViewProps) {
  const { isEdit = false } = props;
  const tableId = parseInt(props.params.tableId, 10);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const dispatch = useDispatch();

  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    if (!table) {
      return undefined;
    }

    return {
      database: table.db_id,
      query: {
        "source-table": table.id,
      },
      type: "query",
    };
  }, [table]);
  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);
  const columns = dataset?.data?.results_metadata?.columns;

  const allColumnNames = columns ? columns.map((col) => col.name) : [];
  const [visibleColumns, setVisibleColumns] =
    useState<string[]>(allColumnNames);

  useMemo(() => {
    setVisibleColumns(allColumnNames);
    // TODO: hack, find a better way to handle this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns && columns.map((col) => col.name).join(",")]);

  const handleEditClick = useCallback(() => {
    dispatch(push(window.location.pathname + `/edit`));
  }, [dispatch]);

  const handleCloseClick = useCallback(() => {
    dispatch(push(window.location.pathname.replace("/edit", "")));
  }, [dispatch]);

  if (!table || !dataset || !columns) {
    return <LoadingAndErrorWrapper loading />;
  }

  const rows = dataset.data.rows;
  const zoomedRow = rows[currentRowIndex] || {};
  const hiddenColumns = allColumnNames.filter(
    (name) => !visibleColumns.includes(name),
  );

  const showColumn = (name: string) =>
    setVisibleColumns((cols) => [...cols, name]);
  const hideColumn = (name: string) =>
    setVisibleColumns((cols) => cols.filter((col) => col !== name));

  // dumb settings
  const settings = {
    "table.columns": visibleColumns.map((name) => ({ name, enabled: true })),
  };

  // stubs
  const onVisualizationClick = () => {};
  const visualizationIsClickable = () => false;

  // Header navigation props
  const canZoom = rows.length > 1;
  const canZoomPreviousRow = currentRowIndex > 0;
  const canZoomNextRow = currentRowIndex < rows.length - 1;
  const objectName = table.name;
  const objectId = null; // You can enhance this to show a PK value if needed

  return (
    <Flex align="stretch" style={{ height: "100%" }}>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Flex align="center" justify="space-between" mb="md">
          <ObjectDetailHeader
            canZoom={canZoom}
            objectName={objectName}
            objectId={objectId}
            canZoomPreviousRow={canZoomPreviousRow}
            canZoomNextRow={canZoomNextRow}
            viewPreviousObjectDetail={() => setCurrentRowIndex((i) => i - 1)}
            viewNextObjectDetail={() => setCurrentRowIndex((i) => i + 1)}
            isEdit={isEdit}
            onEditClick={handleEditClick}
            onCloseClick={handleCloseClick}
          />
        </Flex>
        <ObjectDetailBody
          data={dataset.data}
          objectName={objectName}
          zoomedRow={zoomedRow}
          settings={settings}
          hasRelationships={false}
          onVisualizationClick={onVisualizationClick}
          visualizationIsClickable={visualizationIsClickable}
        />
      </Box>
      {isEdit && (
        <TableDetailViewSidebar
          visibleColumns={visibleColumns}
          hiddenColumns={hiddenColumns}
          showColumn={showColumn}
          hideColumn={hideColumn}
        />
      )}
    </Flex>
  );
}

interface ObjectDetailHeaderProps {
  canZoom: boolean;
  objectName: string;
  objectId: ObjectId | null;
  canZoomPreviousRow: boolean;
  canZoomNextRow?: boolean;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  isEdit: boolean;
  onEditClick: () => void;
  onCloseClick: () => void;
}

function ObjectDetailHeader({
  canZoom,
  objectName,
  objectId,
  canZoomPreviousRow,
  canZoomNextRow,
  viewPreviousObjectDetail,
  viewNextObjectDetail,
  isEdit,
  onEditClick,
  onCloseClick,
}: ObjectDetailHeaderProps): JSX.Element {
  return (
    <ObjectDetailHeaderWrapper className={CS.Grid}>
      <div className={CS.GridCell}>
        <h2 className={CS.p3}>
          {objectName}
          {objectId !== null && <ObjectIdLabel> {objectId}</ObjectIdLabel>}
        </h2>
      </div>

      <Flex align="center" gap="0.5rem" p="1rem">
        {canZoom && (
          <>
            <Button
              data-testid="view-previous-object-detail"
              disabled={!canZoomPreviousRow}
              onClick={viewPreviousObjectDetail}
              leftSection={<Icon name="chevronup" />}
            />
            <Button
              data-testid="view-next-object-detail"
              disabled={!canZoomNextRow}
              onClick={viewNextObjectDetail}
              leftSection={<Icon name="chevrondown" />}
            />
          </>
        )}

        {isEdit && (
          <CloseButton>
            <Button
              data-testid="object-detail-close-button"
              onClick={onCloseClick}
              leftSection={<Icon name="close" />}
            />
          </CloseButton>
        )}
        {!isEdit && (
          <Button size="md" variant="light" onClick={onEditClick} ml="md">
            {t`Edit`}
          </Button>
        )}
      </Flex>
    </ObjectDetailHeaderWrapper>
  );
}

interface TableDetailViewSidebarProps {
  visibleColumns: string[];
  hiddenColumns: string[];
  showColumn: (name: string) => void;
  hideColumn: (name: string) => void;
}
function TableDetailViewSidebar({
  visibleColumns,
  hiddenColumns,
  showColumn,
  hideColumn,
}: TableDetailViewSidebarProps) {
  return (
    <Box
      style={{
        width: 280,
        borderLeft: `1px solid var(--mb-border-color)`,
        padding: 16,
        background: "var(--mb-bg-white)",
        overflowY: "auto",
      }}
    >
      <Text fw={600} size="md" mt={0} mb="xs">{t`Visible columns`}</Text>
      <Stack gap={4}>
        {visibleColumns.map((name) => (
          <Flex key={name} align="center" gap={8}>
            <Text style={{ flex: 1 }}>{name}</Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={t`Hide column`}
              onClick={() => hideColumn(name)}
            >
              <Icon name="eye_crossed_out" size={18} />
            </ActionIcon>
          </Flex>
        ))}
      </Stack>
      <Text fw={600} size="md" mt="lg" mb="xs">{t`Hidden columns`}</Text>
      <Stack gap={4}>
        {hiddenColumns.map((name) => (
          <Flex key={name} align="center" gap={8}>
            <Text style={{ flex: 1, color: "var(--mb-text-light)" }}>
              {name}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={t`Show column`}
              onClick={() => showColumn(name)}
            >
              <Icon name="eye" size={18} />
            </ActionIcon>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}
