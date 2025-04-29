import cx from "classnames";
import { t } from "ttag";

import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Group, Icon, Input, Radio } from "metabase/ui";

import { PeopleList } from "../components/PeopleList";
import { USER_STATUS } from "../constants";
import { usePeopleQuery } from "../hooks/use-people-query";

const PAGE_SIZE = 25;

export function PeopleListingApp({ children }: { children: React.ReactNode }) {
  const isAdmin = useSelector(getUserIsAdmin);

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
    <div className={cx(CS.mb2, CS.flex, CS.alignCenter)}>
      <Input
        miw="18rem"
        mr="1rem"
        fz="sm"
        type="text"
        placeholder={t`Find someone`}
        value={searchInputValue}
        onChange={handleSearchChange}
        leftSection={<Icon c="text-secondary" name="search" size={16} />}
        rightSectionPointerEvents="all"
        rightSection={
          searchInputValue === "" ? null : (
            <Input.ClearButton
              c={"text-secondary"}
              onClick={() => updateSearchInputValue("")}
              style={{ zIndex: 1 }}
            />
          )
        }
      />
      {isAdmin && (
        <Radio.Group value={status} onChange={updateStatus}>
          <Group>
            <Radio label={t`Active`} value={USER_STATUS.active} />
            <Radio label={t`Deactivated`} value={USER_STATUS.deactivated} />
          </Group>
        </Radio.Group>
      )}
    </div>
  );

  const buttonText =
    isAdmin && status === USER_STATUS.active ? t`Invite someone` : "";

  return (
    <AdminPaneLayout
      headingContent={headingContent}
      buttonText={buttonText}
      buttonLink={Urls.newUser()}
    >
      <PeopleList
        query={query}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
      />
      {children}
    </AdminPaneLayout>
  );
}
