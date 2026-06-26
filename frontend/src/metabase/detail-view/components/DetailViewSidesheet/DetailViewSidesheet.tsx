import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import {
  actionApi,
  skipToken,
  useGetAdhocQueryQuery,
  useListActionsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import { useDispatch } from "metabase/redux";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Menu,
  Modal,
  Stack,
  Tooltip,
  rem,
} from "metabase/ui";
import type { OptionsType } from "metabase/utils/formatting/types";
import { DeleteObjectModal } from "metabase/visualizations/components/ObjectDetail/DeleteObjectModal";
import * as Lib from "metabase-lib";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
  TableColumnOrderSetting,
  WritebackActionId,
} from "metabase-types/api";

import { Sidesheet } from "./Sidesheet";
import { extractData, getActionItems, getModelId } from "./utils";

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
  onActionSuccess?: () => void;
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
  onActionSuccess,
  onClose,
  onNextClick,
  onPreviousClick,
}: Props) {
  const dispatch = useDispatch();
  const {
    data: dataset,
    error,
    isLoading,
  } = useGetAdhocQueryQuery(
    query != null && rowFromProps == null ? Lib.toJsQuery(query) : skipToken,
  );
  const { columns, row } = useMemo(
    () => extractData(dataset, columnsFromProp, columnSettings, rowFromProps),
    [dataset, columnsFromProp, columnSettings, rowFromProps],
  );

  const [linkCopied, setLinkCopied] = useState(false);
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const rowName = useMemo(() => {
    return getRowName(columns, row) || rowId;
  }, [columns, row, rowId]);
  const icon = getEntityIcon(table?.entity_type);
  const modelId = getModelId(table);
  const isNavEnabled = rowFromProps != null && showNav;
  const hasPk = columns.some(isPK);

  const [actionId, setActionId] = useState<WritebackActionId>();
  const [deleteActionId, setDeleteActionId] = useState<WritebackActionId>();
  const isActionExecuteModalOpen = typeof actionId === "number";
  const isDeleteModalOpen = typeof deleteActionId === "number";
  const isModalOpen = isActionExecuteModalOpen || isDeleteModalOpen;
  const initialValues = useMemo(() => ({ id: rowId ?? null }), [rowId]);

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

  const [actionsMenuOpened, actionsMenu] = useDisclosure(false);

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

    return runRtkEndpoint(
      {
        id: actionId,
        parameters: { id: String(rowId) },
      },
      dispatch,
      actionApi.endpoints.prefetchActionValues,
    );
  }, [actionId, rowId, dispatch]);

  const handleActionSuccess = useCallback(() => {
    onActionSuccess?.();
  }, [onActionSuccess]);

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

  const isKeyboardNavigationEnabled =
    isNavEnabled && !isModalOpen && !actionsMenuOpened;

  useHotkeys([
    [
      "ArrowUp",
      () => {
        if (isKeyboardNavigationEnabled) {
          onPreviousClick?.();
        }
      },
      { preventDefault: false },
    ],
    [
      "ArrowDown",
      () => {
        if (isKeyboardNavigationEnabled) {
          onNextClick?.();
        }
      },
      { preventDefault: false },
    ],
  ]);

  if (error || isLoading) {
    return (
      <Sidesheet data-testid="object-detail" onClose={handleClose}>
        <LoadingAndErrorWrapper error={error} loading={isLoading} />;
      </Sidesheet>
    );
  }

  if (row == null) {
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
            {isNavEnabled && (
              <>
                <Tooltip disabled={!onPreviousClick} label={t`Previous row`}>
                  <Button
                    aria-label={t`Previous row`}
                    c="text-primary"
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
                    c="text-primary"
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

                <Divider orientation="vertical" />
              </>
            )}

            {actionItems.length > 0 && (
              <Menu
                position="bottom-end"
                onOpen={actionsMenu.open}
                onClose={actionsMenu.close}
              >
                <Menu.Target>
                  <Tooltip label={t`Actions`}>
                    <Button
                      aria-label={t`Actions`}
                      c="text-primary"
                      data-testid="actions-menu"
                      h={20}
                      leftSection={<Icon name="ellipsis" />}
                      p={0}
                      variant="subtle"
                      w={20}
                    />
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  {actionItems.map((item) => (
                    <Menu.Item
                      key={item.title}
                      leftSection={<Icon name={item.icon} aria-hidden />}
                      onClick={item.action}
                    >
                      {item.title}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}

            {url && (
              <>
                <Tooltip
                  label={linkCopied ? t`Copied!` : t`Copy link to this record`}
                >
                  <Button
                    aria-label={
                      linkCopied ? t`Copied!` : t`Copy link to this record`
                    }
                    c="text-primary"
                    h={20}
                    leftSection={<Icon name="link" />}
                    p={0}
                    variant="subtle"
                    w={20}
                    onClick={handleCopyLink}
                  />
                </Tooltip>

                <Tooltip label={t`Open in full page`}>
                  <Box>
                    <Button
                      aria-label={t`Open in full page`}
                      c="text-primary"
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
              {columns.length > 0 && (
                <DetailsGroup
                  columns={columns}
                  columnsSettings={columnsSettings}
                  row={row}
                  table={table}
                />
              )}
            </Stack>
          </Group>

          {table &&
            hasPk &&
            tableForeignKeys &&
            tableForeignKeys.length > 0 && (
              <Box
                flex="1"
                bg="background_page-secondary"
                px={rem(56)}
                py={rem(48)}
              >
                <Relationships
                  rowId={rowId}
                  rowName={rowName}
                  tableForeignKeys={tableForeignKeys}
                  onClick={onClose}
                />
              </Box>
            )}
        </Stack>
      </Sidesheet>

      <ActionExecuteModal
        opened={isActionExecuteModalOpen}
        actionId={actionId}
        initialValues={initialValues}
        fetchInitialValues={fetchInitialValues}
        shouldPrefetch
        onClose={handleExecuteModalClose}
        onSuccess={handleActionSuccess}
      />

      <Modal
        opened={isDeleteModalOpen}
        onClose={handleDeleteModalClose}
        size="lg"
        withCloseButton={false}
        padding={0}
      >
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
