import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useAddAnalystMutation,
  useListAnalystsQuery,
  useListUsersQuery,
  useRemoveAnalystMutation,
} from "metabase/api";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { AdminPaneLayout } from "metabase/common/components/AdminPaneLayout";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import UserAvatar from "metabase/common/components/UserAvatar";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { useDispatch } from "metabase/lib/redux";
import { getFullName } from "metabase/lib/user";
import { addUndo } from "metabase/redux/undo";
import {
  Box,
  Button,
  Flex,
  Icon,
  Pill,
  Popover,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import type { User } from "metabase-types/api";

const PAGE_SIZE = 25;

export function AnalystsApp() {
  const dispatch = useDispatch();

  const { data: analystsData, isLoading: isLoadingAnalysts } =
    useListAnalystsQuery();
  const { data: usersData, isLoading: isLoadingUsers } = useListUsersQuery();

  const [addAnalyst] = useAddAnalystMutation();
  const [removeAnalyst] = useRemoveAnalystMutation();

  const [addUserVisible, setAddUserVisible] = useState(false);
  const [text, setText] = useState("");
  const [selectedUsersById, setSelectedUsersById] = useState<Map<number, User>>(
    new Map(),
  );

  const { handleNextPage, handlePreviousPage, page } = usePagination();
  const offset = page * PAGE_SIZE;

  const analysts = useMemo(() => analystsData?.data ?? [], [analystsData]);
  const analystsPage = useMemo(
    () => analysts.slice(offset, offset + PAGE_SIZE),
    [analysts, offset],
  );
  const analystIds = useMemo(
    () => new Set(analysts.map((u) => u.id)),
    [analysts],
  );

  const availableToSelectUsers = useMemo(() => {
    if (isLoadingUsers) {
      return [];
    }
    const allUsers = usersData?.data ?? [];
    return allUsers.filter(
      ({ id }) => !selectedUsersById.has(id) && !analystIds.has(id),
    );
  }, [usersData, selectedUsersById, analystIds, isLoadingUsers]);

  const suggestedUsers = useMemo(() => {
    const input = text.toLowerCase();
    return availableToSelectUsers.filter((user) =>
      (user.common_name || "").toLowerCase().includes(input),
    );
  }, [availableToSelectUsers, text]);

  const handleAddUser = (user: User) => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.set(user.id, user);
    setSelectedUsersById(newSelectedUsersById);
    setText("");
  };

  const handleRemoveUser = (user: User) => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.delete(user.id);
    setSelectedUsersById(newSelectedUsersById);
  };

  const handleDone = async () => {
    const userIds = Array.from(selectedUsersById.keys());
    try {
      await Promise.all(userIds.map((userId) => addAnalyst(userId).unwrap()));
      setAddUserVisible(false);
      setSelectedUsersById(new Map());
      setText("");
    } catch {
      dispatch(addUndo({ message: t`Failed to add analyst` }));
    }
  };

  const handleRemoveAnalyst = async (userId: number) => {
    try {
      await removeAnalyst(userId).unwrap();
    } catch {
      dispatch(addUndo({ message: t`Failed to remove analyst` }));
    }
  };

  const handleCancel = () => {
    setAddUserVisible(false);
    setSelectedUsersById(new Map());
    setText("");
  };

  if (isLoadingAnalysts) {
    return null;
  }

  return (
    <SettingsSection>
      <AdminPaneLayout
        title={
          <>
            {t`Analysts`}
            <Box component="span" c="text-light" ms="sm">
              {ngettext(
                msgid`${analysts.length} member`,
                `${analysts.length} members`,
                analysts.length,
              )}
            </Box>
          </>
        }
        titleActions={
          <Button
            variant="filled"
            onClick={() => setAddUserVisible(true)}
            disabled={addUserVisible}
          >{t`Add analysts`}</Button>
        }
      >
        <Box maw="38rem" px="1rem" mb="md">
          <Text>
            {t`Analysts have access to the Library and Dependencies features in Data Studio. They can view and organize existing content but cannot access the admin panel.`}
          </Text>
        </Box>

        <AdminContentTable columnTitles={[t`Name`, t`Email`]}>
          {addUserVisible && (
            <tr>
              <td colSpan={2} style={{ padding: 0 }}>
                <Popover
                  opened={suggestedUsers.length > 0}
                  position="bottom-start"
                  withArrow
                  shadow="md"
                >
                  <Popover.Target>
                    <Flex align="center" gap="sm" p="sm">
                      {Array.from(selectedUsersById.values()).map((user) => (
                        <Pill
                          key={user.id}
                          size="xl"
                          bg="bg-medium"
                          c="text-primary"
                          withRemoveButton
                          onRemove={() => handleRemoveUser(user)}
                        >
                          {user.common_name}
                        </Pill>
                      ))}
                      <TextInput
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={t`Search for a user to add`}
                        style={{ flex: 1 }}
                        autoFocus
                      />
                      <Button
                        variant="filled"
                        onClick={handleDone}
                        disabled={selectedUsersById.size === 0}
                      >{t`Done`}</Button>
                      <Button variant="subtle" onClick={handleCancel}>
                        {t`Cancel`}
                      </Button>
                    </Flex>
                  </Popover.Target>

                  <Popover.Dropdown>
                    <Flex direction="column" p="xs" miw="15rem">
                      {suggestedUsers.slice(0, 10).map((user) => (
                        <Flex
                          key={user.id}
                          component={UnstyledButton}
                          align="center"
                          gap="md"
                          p="0.5rem 1rem"
                          onClick={() => handleAddUser(user)}
                        >
                          <UserAvatar user={user} />
                          <Text fw="bold" size="lg">
                            {user.common_name}
                          </Text>
                        </Flex>
                      ))}
                    </Flex>
                  </Popover.Dropdown>
                </Popover>
              </td>
            </tr>
          )}
          {analystsPage.map((user) => (
            <tr key={user.id}>
              <td>
                <Text fw={700}>{getFullName(user) ?? "-"}</Text>
              </td>
              <td>{user.email}</td>
              <Box component="td" ta="right">
                <UnstyledButton onClick={() => handleRemoveAnalyst(user.id)}>
                  <Icon name="close" c="text-light" size={16} />
                </UnstyledButton>
              </Box>
            </tr>
          ))}
        </AdminContentTable>

        {analysts.length > 0 ? (
          <Flex align="center" justify="flex-end" p="md">
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              itemsLength={analystsPage.length}
              total={analysts.length}
              onNextPage={handleNextPage}
              onPreviousPage={handlePreviousPage}
            />
          </Flex>
        ) : !addUserVisible ? (
          <Text size="lg" fw="700" ta="center" mt="4rem">
            {t`No analysts yet. Add users to give them analyst permissions.`}
          </Text>
        ) : null}
      </AdminPaneLayout>
    </SettingsSection>
  );
}
