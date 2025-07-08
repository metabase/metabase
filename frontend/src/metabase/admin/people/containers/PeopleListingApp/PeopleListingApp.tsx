import { Link } from "react-router";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { AdminPaneLayout } from "metabase/common/components/AdminPaneLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Button, Flex, Group } from "metabase/ui";

import { ActiveStatusFilter } from "../../components/ActiveStatusFilter";
import { PeopleList } from "../../components/PeopleList";
import { SearchFilter } from "../../components/SearchFilter";
import { ACTIVE_STATUS } from "../../constants";
import { usePeopleQuery } from "../../hooks/use-people-query";

const PAGE_SIZE = 25;

const DEFAULT_NO_RESULTS_MESSAGE = () => t`No results found`;

export function PeopleListingApp({
  children,
  external = false,
  showInviteButton = true,
  noResultsMessage = DEFAULT_NO_RESULTS_MESSAGE(),
}: {
  children?: React.ReactNode;
  external: boolean;
  showInviteButton: boolean;
  noResultsMessage?: string;
}) {
  const isAdmin = useSelector(getUserIsAdmin);
  const currentUser = useSelector(getUser);

  const {
    data: groups = [],
    isLoading,
    error,
  } = useListPermissionsGroupsQuery(undefined, { skip: external });

  const {
    query,
    status,
    searchInputValue,
    updateSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  } = usePeopleQuery(PAGE_SIZE, external ? "external" : "internal");

  const noUsersFoundMessage =
    status === ACTIVE_STATUS.active
      ? noResultsMessage
      : DEFAULT_NO_RESULTS_MESSAGE();

  return (
    <SettingsPageWrapper title={external ? t`External Users` : t`People`}>
      <SettingsSection>
        <LoadingAndErrorWrapper
          error={error}
          loading={isLoading || !currentUser}
        >
          <AdminPaneLayout
            headerContent={
              <Flex justify="space-between" w="100%">
                <Group>
                  <SearchFilter
                    value={searchInputValue}
                    onChange={updateSearchInputValue}
                    placeholder={t`Find someone`}
                  />

                  {isAdmin && (
                    <ActiveStatusFilter
                      status={status}
                      onStatusChange={updateStatus}
                    />
                  )}
                </Group>
                <Group gap="sm">
                  {isAdmin &&
                    status === ACTIVE_STATUS.active &&
                    showInviteButton && (
                      <Link
                        to={external ? Urls.newTenantUser() : Urls.newUser()}
                      >
                        <Button variant="filled">{t`Invite someone`}</Button>
                      </Link>
                    )}
                  {!external && (
                    <PLUGIN_TENANTS.EditUserStrategySettingsButton />
                  )}
                </Group>
              </Flex>
            }
          >
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
          </AdminPaneLayout>
        </LoadingAndErrorWrapper>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
