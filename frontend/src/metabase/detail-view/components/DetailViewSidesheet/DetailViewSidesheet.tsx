import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import {
  skipToken,
  useGetAdhocQueryQuery,
  useListActionsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import EntityMenu from "metabase/common/components/EntityMenu";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import Modal from "metabase/common/components/Modal";
import {
  DetailsGroup,
  Header,
  Relationships,
} from "metabase/detail-view/components";
import {
  getEntityIcon,
  getHeaderColumns,
  getRowName,
} from "metabase/detail-view/utils";
import type { OptionsType } from "metabase/lib/formatting/types";
import { useDispatch } from "metabase/lib/redux";
import { runQuestionQuery } from "metabase/query_builder/actions";
import { ActionsApi } from "metabase/services";
import { Box, Button, Group, Icon, Stack, Tooltip, rem } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import { DeleteObjectModal } from "metabase/visualizations/components/ObjectDetail/DeleteObjectModal";
import * as Lib from "metabase-lib";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
  TableColumnOrderSetting,
  WritebackActionId,
} from "metabase-types/api";

import S from "./DetailViewSidesheet.module.css";
import { Sidesheet } from "./Sidesheet";
import { getActionItems } from "./utils";

interface Props {
  columnSettings: TableColumnOrderSetting[] | undefined;
  columns: DatasetColumn[];
  columnsSettings: (OptionsType | undefined)[];
  query: Lib.Query | undefined;
  row: RowValues | undefined;
  rowId: string | number;
  showImplicitActions: boolean;
  showNav: boolean;
  table: Table | undefined;
  tableForeignKeys?: ForeignKey[];
  url: string | undefined;
  onClose: () => void;
  onNextClick: (() => void) | undefined;
  onPreviousClick: (() => void) | undefined;
}

export function DetailViewSidesheet({
  columns: columnsFromProp,
  columnSettings,
  columnsSettings,
  query,
  row: rowFromProps,
  rowId,
  showImplicitActions,
  showNav,
  table,
  tableForeignKeys,
  url,
  onClose,
  onNextClick,
  onPreviousClick,
}: Props) {
  const {
    data: dataset,
    error,
    isLoading,
  } = useGetAdhocQueryQuery(
    query != null && rowFromProps == null
      ? Lib.toLegacyQuery(query)
      : skipToken,
  );
  const data = useMemo(() => {
    return dataset ? extractRemappedColumns(dataset.data) : undefined;
  }, [dataset]);
  const unsortedColumns = data?.cols ?? columnsFromProp;
  const columnIndexes = useMemo(() => {
    if (!columnSettings) {
      return unsortedColumns.map((_value, index) => index);
    }

    return findColumnIndexesForColumnSettings(
      unsortedColumns,
      columnSettings.filter(({ enabled }) => enabled),
    ).filter((columnIndex: number) => columnIndex >= 0);
  }, [columnSettings, unsortedColumns]);
  const columns = useMemo(() => {
    return columnIndexes.map((index) => unsortedColumns[index]);
  }, [columnIndexes, unsortedColumns]);

  const rowFromQuery = useMemo(() => (data?.rows ?? [])[0], [data]);
  const row = useMemo(() => {
    const row = rowFromProps ?? rowFromQuery;

    if (!row) {
      return undefined;
    }

    return columnIndexes.map((index) => row[index]);
  }, [columnIndexes, rowFromProps, rowFromQuery]);

  const dispatch = useDispatch();
  const [linkCopied, setLinkCopied] = useState(false);
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const rowName = useMemo(() => {
    return getRowName(columns, row) || rowId;
  }, [columns, row, rowId]);
  const icon = getEntityIcon(table?.entity_type);

  const [actionId, setActionId] = useState<WritebackActionId>();
  const [deleteActionId, setDeleteActionId] = useState<WritebackActionId>();
  const isActionExecuteModalOpen = typeof actionId === "number";
  const isDeleteModalOpen = typeof deleteActionId === "number";
  const isModalOpen = isActionExecuteModalOpen || isDeleteModalOpen;
  const initialValues = useMemo(() => ({ id: rowId ?? null }), [rowId]);

  const modelId =
    table?.type === "model"
      ? getQuestionIdFromVirtualTableId(table.id)
      : undefined;
  const { data: actions } = useListActionsQuery(
    showImplicitActions && modelId != null
      ? { "model-id": modelId }
      : skipToken,
  );

  const { data: databases } = useListDatabasesQuery(
    showImplicitActions ? {} : skipToken,
  );

  const actionItems = getActionItems({
    actions: actions ?? [],
    databases: databases?.data ?? [],
    onDelete: (action) => setDeleteActionId(action.id),
    onUpdate: (action) => setActionId(action.id),
  });

  const handleClose = () => {
    // prevent Esc key from closing both modal and the sidesheet
    if (!isModalOpen) {
      onClose();
    }
  };

  const handleExecuteModalClose = () => {
    setActionId(undefined);
  };

  const handleDeleteModalClose = () => {
    setDeleteActionId(undefined);
  };

  const fetchInitialValues = useCallback(async () => {
    if (typeof actionId !== "number") {
      return {};
    }

    return ActionsApi.prefetchValues({
      id: actionId,
      parameters: JSON.stringify({ id: String(rowId) }),
    });
  }, [actionId, rowId]);

  const handleActionSuccess = useCallback(() => {
    dispatch(runQuestionQuery());
  }, [dispatch]);

  const handleDeleteSuccess = useCallback(() => {
    handleActionSuccess();
    onClose();
  }, [onClose, handleActionSuccess]);

  const handleCopyLink = useCallback(() => {
    if (!url) {
      return;
    }

    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    setLinkCopied(true);
  }, [url]);

  useEffect(() => {
    if (linkCopied) {
      const timeout = setTimeout(() => setLinkCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [linkCopied]);

  if (error || isLoading) {
    return (
      <Sidesheet data-testid="object-detail" onClose={handleClose}>
        <LoadingAndErrorWrapper error={error} loading={isLoading} />;
      </Sidesheet>
    );
  } else if (row == null) {
    return (
      <Sidesheet data-testid="object-detail" onClose={handleClose}>
        <Group align="center" justify="center">
          <NotFound message={t`We couldn't find that record`} />
        </Group>
      </Sidesheet>
    );
  }

  return (
    <>
      <Sidesheet
        actions={
          <>
            {rowFromProps != null && showNav && (
              <>
                <Tooltip disabled={!onPreviousClick} label={t`Previous row`}>
                  <Button
                    aria-label={t`Previous row`}
                    c="text-dark"
                    disabled={!onPreviousClick}
                    h={20}
                    leftSection={<Icon name="chevronup" />}
                    p={0}
                    variant="subtle"
                    style={{
                      opacity: onPreviousClick ? undefined : 0.5,
                    }}
                    w={20}
                    onClick={onPreviousClick}
                  />
                </Tooltip>

                <Tooltip disabled={!onNextClick} label={t`Next row`}>
                  <Button
                    aria-label={t`Next row`}
                    c="text-dark"
                    disabled={!onNextClick}
                    h={20}
                    leftSection={<Icon name="chevrondown" />}
                    p={0}
                    variant="subtle"
                    style={{
                      opacity: onNextClick ? undefined : 0.5,
                    }}
                    w={20}
                    onClick={onNextClick}
                  />
                </Tooltip>

                <Separator />
              </>
            )}

            {actionItems.length > 0 && (
              <EntityMenu
                items={actionItems}
                renderTrigger={({ onClick }: { onClick: () => void }) => (
                  <Tooltip label={t`Actions`}>
                    <Button
                      aria-label={t`Actions`}
                      c="text-dark"
                      data-testid="actions-menu"
                      h={20}
                      leftSection={<Icon name="ellipsis" />}
                      p={0}
                      variant="subtle"
                      w={20}
                      onClick={onClick}
                    />
                  </Tooltip>
                )}
              />
            )}

            {url && (
              <>
                <Tooltip
                  label={linkCopied ? t`Copied!` : t`Copy link to a row`}
                >
                  <Button
                    aria-label={linkCopied ? t`Copied!` : t`Copy link to a row`}
                    c="text-dark"
                    h={20}
                    leftSection={<Icon name="link" />}
                    p={0}
                    variant="subtle"
                    w={20}
                    onClick={handleCopyLink}
                  />
                </Tooltip>

                <Tooltip label={t`Open row page`}>
                  <Box>
                    <Button
                      aria-label={t`Open row page`}
                      c="text-dark"
                      component={Link}
                      h={20}
                      leftSection={<Icon name="expand" />}
                      p={0}
                      to={url}
                      variant="subtle"
                      w={20}
                    />
                  </Box>
                </Tooltip>
              </>
            )}
          </>
        }
        data-testid="object-detail"
        onClose={handleClose}
      >
        <Stack gap={0} mih="100%">
          {headerColumns.length > 0 && (
            <Box pb="md" pt="xs" px={rem(56)}>
              <Box
                // intentionally misalign the header to create an "optical alignment effect" (due to rounded avatar)
                ml={rem(-8)}
              >
                <Header columns={columns} icon={icon} row={row} />
              </Box>
            </Box>
          )}

          <Group pb={rem(48)} pt="xl" px={rem(56)}>
            <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
              {columns.length - headerColumns.length > 0 && (
                <DetailsGroup
                  columns={columns}
                  columnsSettings={columnsSettings}
                  row={row}
                  table={table}
                />
              )}
            </Stack>
          </Group>

          {table && tableForeignKeys && tableForeignKeys.length > 0 && (
            <Box
              flex="1"
              bg="var(--mb-color-background-light)"
              px={rem(56)}
              py={rem(48)}
            >
              <Relationships
                columns={columns}
                row={row}
                rowId={rowId}
                rowName={rowName}
                table={table}
                tableForeignKeys={tableForeignKeys}
                onClick={onClose}
              />
            </Box>
          )}
        </Stack>
      </Sidesheet>

      <Modal
        isOpen={isActionExecuteModalOpen}
        onClose={handleExecuteModalClose}
      >
        <ActionExecuteModal
          actionId={actionId}
          initialValues={initialValues}
          fetchInitialValues={fetchInitialValues}
          shouldPrefetch
          onClose={handleExecuteModalClose}
          onSuccess={handleActionSuccess}
        />
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={handleDeleteModalClose}>
        <DeleteObjectModal
          actionId={deleteActionId}
          objectId={rowId}
          onClose={handleDeleteModalClose}
          onSuccess={handleDeleteSuccess}
        />
      </Modal>
    </>
  );
}

const Separator = () => <Box className={S.separator} h={20} />;
