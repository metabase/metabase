import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Group, Icon, Input, Radio } from "metabase/ui";

import { PeopleList } from "../components/PeopleList";
import { USER_STATUS } from "../constants";
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSearchInputValue(e.target.value);
  };

  const headingContent = (
    <Flex align="center" mb="xl">
      <Input
        miw="14rem"
        mr="xl"
        fz="sm"
        type="text"
        placeholder={t`Find someone`}
        value={searchInputValue}
        onChange={handleSearchChange}
        leftSection={<Icon c="text-secondary" name="search" size={16} />}
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
      {isAdmin && (
        <Radio.Group
          value={status}
          onChange={(val) => updateStatus(USER_STATUS[val])}
        >
          <Group>
            <Radio label={t`Active`} value={USER_STATUS.active} />
            <Radio label={t`Deactivated`} value={USER_STATUS.deactivated} />
          </Group>
        </Radio.Group>
      )}
    </Flex>
  );

  const buttonText =
    isAdmin && status === USER_STATUS.active ? t`Invite someone` : "";

  return (
    <LoadingAndErrorWrapper error={error} loading={isLoading || !currentUser}>
      <AdminPaneLayout
        headingContent={headingContent}
        buttonText={buttonText}
        buttonLink={Urls.newUser()}
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
