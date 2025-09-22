import { useEffect } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Icon, Input, Tabs } from "metabase/ui";

import { PeopleList } from "../components/PeopleList";
import { USER_STATUS, type UserStatus } from "../constants";
import { usePeopleQuery } from "../hooks/use-people-query";

const PAGE_SIZE = 25;

export function PeopleListingApp({ children }: { children: React.ReactNode }) {
  const isAdmin = useSelector(getUserIsAdmin);
  const currentUser = useSelector(getUser);

  const {
    data: groups = [],
    isLoading,
    error,
  } = useListPermissionsGroupsQuery();

  const {
    query,
    status,
    searchInputValue,
    updateSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  } = usePeopleQuery(PAGE_SIZE);

  const { data: usersData } = useListUsersQuery({
    status: "deactivated",
    limit: 0,
  });
  const hasDeactivatedUsers = usersData && usersData.total > 0;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSearchInputValue(e.target.value);
  };

  const buttonText =
    isAdmin && status === USER_STATUS.active ? t`Invite someone` : undefined;

  useEffect(() => {
    if (!hasDeactivatedUsers) {
      updateStatus("active");
    }
  }, [hasDeactivatedUsers, updateStatus]);

  const handleTabChange = (tab: string | null) => {
    if (tab) {
      updateStatus(tab as UserStatus);
    }
  };

  return (
    <SettingsPageWrapper title={t`People`}>
      <SettingsSection>
        <LoadingAndErrorWrapper
          error={error}
          loading={isLoading || !currentUser}
        >
          <div data-testid="admin-panel">
            {isAdmin && hasDeactivatedUsers && (
              <Tabs mb="lg" value={status} onChange={handleTabChange}>
                <Tabs.List>
                  <Tabs.Tab value={USER_STATUS.active}>{t`Active`}</Tabs.Tab>
                  <Tabs.Tab
                    value={USER_STATUS.deactivated}
                  >{t`Deactived`}</Tabs.Tab>
                </Tabs.List>
              </Tabs>
            )}

            <Box mb="xl">
              <Flex wrap="wrap" gap="md" justify="space-between">
                <Flex align="center">
                  <Input
                    miw="14rem"
                    mr="xl"
                    fz="sm"
                    type="text"
                    placeholder={t`Find someone`}
                    value={searchInputValue}
                    onChange={handleSearchChange}
                    leftSection={
                      <Icon c="text-secondary" name="search" size={16} />
                    }
                    rightSectionPointerEvents="all"
                    rightSection={
                      searchInputValue === "" ? (
                        <div /> // rendering null causes width change
                      ) : (
                        <Input.ClearButton
                          c={"text-secondary"}
                          onClick={() => updateSearchInputValue("")}
                        />
                      )
                    }
                  />
                </Flex>

                {buttonText && (
                  <Box>
                    <Link to={Urls.newUser()}>
                      <Button variant="filled">{buttonText}</Button>
                    </Link>
                  </Box>
                )}
              </Flex>
            </Box>

            {currentUser && (
              <PeopleList
                groups={groups}
                isAdmin={isAdmin}
                currentUser={currentUser}
                query={query}
                onNextPage={handleNextPage}
                onPreviousPage={handlePreviousPage}
              />
            )}

            {children}
          </div>
        </LoadingAndErrorWrapper>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
