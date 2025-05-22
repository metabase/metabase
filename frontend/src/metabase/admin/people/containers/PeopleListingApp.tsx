import { Link } from "react-router";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Button, Flex } from "metabase/ui";

import { ActiveStatusFilter } from "../components/ActiveStatusFilter";
import { PeopleList } from "../components/PeopleList";
import { SearchFilter } from "../components/SearchFilter";
import { ACTIVE_STATUS } from "../constants";
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

  return (
    <LoadingAndErrorWrapper error={error} loading={isLoading || !currentUser}>
      <AdminPaneLayout
        title={t`People`}
        titleActions={
          <Flex gap="sm">
            {isAdmin && status === ACTIVE_STATUS.active && (
              <Link to={Urls.newUser()}>
                <Button variant="filled">{t`Invite someone`}</Button>
              </Link>
            )}
            <PLUGIN_TENANTS.EditUserStrategySettingsButton />
          </Flex>
        }
        headerContent={
          <>
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
          </>
        }
      >
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
      </AdminPaneLayout>
    </LoadingAndErrorWrapper>
  );
}
