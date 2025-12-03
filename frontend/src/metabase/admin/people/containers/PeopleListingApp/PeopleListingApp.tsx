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
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Stack, Tabs } from "metabase/ui";

import { PeopleList } from "../../components/PeopleList";
import { SearchFilter } from "../../components/SearchFilter";
import { ACTIVE_STATUS, type ActiveStatus } from "../../constants";
import { usePeopleQuery } from "../../hooks/use-people-query";

import S from "./PeopleListingApp.module.css";

const PAGE_SIZE = 25;

const DEFAULT_NO_RESULTS_MESSAGE = () => t`No results found`;

export function PeopleListingApp({
  children,
  external = false,
  showInviteButton = true,
  noResultsMessage = DEFAULT_NO_RESULTS_MESSAGE(),
}: {
  children?: React.ReactNode;
  external?: boolean;
  showInviteButton?: boolean;
  noResultsMessage?: string;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const currentUser = useSelector(getUser);

  const {
    data: groups = [],
    isLoading,
    error,
  } = useListPermissionsGroupsQuery(
    { tenancy: "internal" },
    { skip: external },
  );

  const {
    query,
    status,
    searchInputValue,
    updateSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  } = usePeopleQuery(PAGE_SIZE, external ? "external" : "internal");

  const { data: usersData } = useListUsersQuery({
    status: "deactivated",
    limit: 0,
    ...(external ? { tenancy: "external" } : { tenancy: "internal" }),
  });
  const hasDeactivatedUsers = usersData && usersData.total > 0;

  const noUsersFoundMessage =
    status === ACTIVE_STATUS.active
      ? noResultsMessage
      : DEFAULT_NO_RESULTS_MESSAGE();

  const buttonText =
    isAdmin && status === ACTIVE_STATUS.active && showInviteButton
      ? t`Invite someone`
      : undefined;

  const handleTabChange = (tab: string | null) => {
    if (tab) {
      updateStatus(tab as ActiveStatus);
    }
  };

  useEffect(() => {
    if (!hasDeactivatedUsers) {
      updateStatus("active");
    }
  }, [hasDeactivatedUsers, updateStatus]);

  return (
    <SettingsPageWrapper title={external ? t`External Users` : t`People`}>
      <Stack gap={0}>
        {isAdmin && hasDeactivatedUsers && (
          <Tabs value={status} onChange={handleTabChange} pl="md">
            <Tabs.List className={S.tabs}>
              <Tabs.Tab value={ACTIVE_STATUS.active}>{t`Active`}</Tabs.Tab>
              <Tabs.Tab
                value={ACTIVE_STATUS.deactivated}
              >{t`Deactivated`}</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        )}

        <SettingsSection>
          <LoadingAndErrorWrapper
            error={error}
            loading={isLoading || !currentUser}
          >
            <div data-testid="admin-panel">
              <Flex
                align="center"
                gap="xl"
                justify="space-between"
                mb="xl"
                wrap="wrap"
              >
                <SearchFilter
                  value={searchInputValue}
                  onChange={updateSearchInputValue}
                  placeholder={t`Find someone`}
                />

                {buttonText && (
                  <Flex gap="sm">
                    <Box>
                      <Link
                        to={external ? Urls.newTenantUser() : Urls.newUser()}
                      >
                        <Button variant="filled">{buttonText}</Button>
                      </Link>
                    </Box>
                    {!external && (
                      <PLUGIN_TENANTS.EditUserStrategySettingsButton />
                    )}
                  </Flex>
                )}
              </Flex>

              {currentUser && (
                <PeopleList
                  external={external}
                  groups={groups}
                  isAdmin={isAdmin}
                  currentUser={currentUser}
                  query={query}
                  onNextPage={handleNextPage}
                  onPreviousPage={handlePreviousPage}
                  noResultsMessage={noUsersFoundMessage}
                />
              )}

              {children}
            </div>
          </LoadingAndErrorWrapper>
        </SettingsSection>
      </Stack>
    </SettingsPageWrapper>
  );
}
