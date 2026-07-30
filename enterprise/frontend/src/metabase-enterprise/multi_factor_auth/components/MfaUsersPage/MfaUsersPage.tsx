import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { SearchFilter } from "metabase/admin/people/components/SearchFilter";
import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { EmptyState } from "metabase/common/components/EmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  Box,
  Card,
  Group,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { MfaAdminUser, MfaUserListResponse } from "metabase-types/api";

import { AUTHENTICATION_PATH } from "../../constants";

import S from "./MfaUsersPage.module.css";

export const PAGE_SIZE = 25;

export interface MfaUsersPageProps<TUser extends MfaAdminUser> {
  title: string;
  emptyMessage: string;
  tableAriaLabel: string;
  testId: string;
  columns: TreeTableColumnDef<TUser>[];
  response: MfaUserListResponse<TUser> | undefined;
  searchValue: string;
  onSearchChange: (value: string) => void;
  page: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
  isLoading: boolean;
  error: unknown;
}

export const MfaUsersPage = <TUser extends MfaAdminUser>({
  title,
  emptyMessage,
  tableAriaLabel,
  testId,
  columns,
  response,
  searchValue,
  onSearchChange,
  page,
  onNextPage,
  onPreviousPage,
  isLoading,
  error,
}: MfaUsersPageProps<TUser>) => {
  const users = response?.data ?? [];

  const instance = useTreeTableInstance<TUser>({
    data: users,
    columns,
    getNodeId: (user) => String(user.id),
    enableSorting: false,
  });

  return (
    <SettingsPageWrapper h="100%" mih={0} w="100%" px="xl">
      <Breadcrumbs crumbs={[[t`2FA`, AUTHENTICATION_PATH], [title]]} />

      <SearchFilter
        value={searchValue}
        onChange={onSearchChange}
        placeholder={t`Search…`}
      />

      {isLoading || error ? (
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <Card
          withBorder
          p={0}
          flex="1"
          mih={0}
          display="flex"
          style={{ flexDirection: "column", overflow: "hidden" }}
          data-testid={testId}
        >
          <TreeTable
            instance={instance}
            hierarchical={false}
            classNames={{ row: S.staticRow, cell: S.cell }}
            ariaLabel={tableAriaLabel}
            emptyState={
              <Box p="xl" ta="center">
                <EmptyState
                  title={emptyMessage}
                  illustrationElement={<img src={NoResults} />}
                  spacing="sm"
                />
              </Box>
            }
          />
        </Card>
      )}

      <Group justify="end">
        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          itemsLength={users.length}
          total={response?.total ?? 0}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        />
      </Group>
    </SettingsPageWrapper>
  );
};
