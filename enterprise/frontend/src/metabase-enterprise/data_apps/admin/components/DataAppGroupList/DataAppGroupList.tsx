import cx from "classnames";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { AdminContentTable } from "metabase/admin/components/AdminContentTable";
import { EmptyState } from "metabase/common/components/EmptyState";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import Animation from "metabase/css/core/animation.module.css";
import {
  Box,
  Collapse,
  Flex,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { DataAppGroup } from "metabase-types/api";

import { AddDataAppGroups } from "../AddDataAppGroups/AddDataAppGroups";

import S from "./DataAppGroupList.module.css";

const PAGE_SIZE = 25;

type Props = {
  isAdding: boolean;
  groups: DataAppGroup[];
  onAddGroups: (groupIds: number[]) => Promise<boolean>;
  onCancelAdd: () => void;
  onRemoveGroup: (group: DataAppGroup) => Promise<boolean>;
};

export const DataAppGroupList = ({
  isAdding,
  groups,
  onAddGroups,
  onCancelAdd,
  onRemoveGroup,
}: Props) => {
  const { handleNextPage, handlePreviousPage, page, setPage } = usePagination();

  const lastPage = Math.max(0, Math.ceil(groups.length / PAGE_SIZE) - 1);

  // make sure user does not stay in an empty page if the
  // removed group is the last one in the page
  useEffect(() => {
    setPage((page) => Math.min(page, lastPage));
  }, [lastPage, setPage]);

  const visibleGroups = useMemo(
    () => groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [groups, page],
  );

  return (
    <Stack data-testid="group-management-sections" gap="lg">
      <Box
        className={cx(
          S.groupListContent,
          !isAdding && S.transitioningGroupListContent,
        )}
      >
        {(isAdding || groups.length > 0) && (
          <Box
            data-testid="data-app-groups-card"
            bd={groups.length > 0 ? "1px solid var(--mb-color-border)" : 0}
            bdrs="sm"
            bg="background-primary"
            style={{ overflow: "hidden" }}
          >
            {isAdding && (
              <AddDataAppGroups
                groups={groups}
                onAddGroups={onAddGroups}
                onCancel={onCancelAdd}
              />
            )}

            {groups.length > 0 && (
              <AdminContentTable
                className={cx(S.groupTable, Animation.fadeIn)}
                columnTitles={[t`Group name`, t`Members`, null]}
              >
                {visibleGroups.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    onRemove={onRemoveGroup}
                  />
                ))}
              </AdminContentTable>
            )}

            {groups.length > PAGE_SIZE && (
              <Flex align="center" justify="flex-end" p="md">
                <PaginationControls
                  page={page}
                  pageSize={PAGE_SIZE}
                  itemsLength={visibleGroups.length}
                  total={groups.length}
                  onNextPage={handleNextPage}
                  onPreviousPage={handlePreviousPage}
                />
              </Flex>
            )}
          </Box>
        )}

        <Collapse
          in={groups.length === 0}
          transitionDuration={150}
          transitionTimingFunction="ease-out"
        >
          <DataAppGroupsEmptyState />
        </Collapse>
      </Box>
    </Stack>
  );
};

const DataAppGroupsEmptyState = () => (
  <Box
    data-testid="data-app-groups-empty-state"
    bg="background-secondary"
    bdrs="md"
    py="5rem"
  >
    <EmptyState
      title={t`No groups have access yet`}
      spacing="sm"
      illustrationElement={
        <img
          src={NoResults}
          alt={t`No results`}
          width={120}
          height={120}
          data-testid="data-app-groups-empty-state-icon"
        />
      }
    />
  </Box>
);

const GroupRow = ({
  group,
  onRemove,
}: {
  group: DataAppGroup;
  onRemove: (group: DataAppGroup) => void;
}) => {
  const name = getGroupNameLocalized(group);

  return (
    <tr>
      <td>
        <Text fw={700}>{name}</Text>
      </td>

      <td>{group.member_count}</td>

      <Box component="td" w="1%" style={{ whiteSpace: "nowrap" }}>
        <Flex
          data-testid="data-app-group-actions"
          align="center"
          justify="flex-end"
          gap="lg"
          wrap="nowrap"
          style={{ minWidth: "max-content" }}
        >
          <UnstyledButton
            aria-label={t`Remove ${name}`}
            onClick={() => onRemove(group)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" c="text-disabled" size={16} />
          </UnstyledButton>
        </Flex>
      </Box>
    </tr>
  );
};
