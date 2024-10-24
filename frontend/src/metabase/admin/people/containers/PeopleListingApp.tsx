import cx from "classnames";
import PropTypes from "prop-types";
import type { ChangeEventHandler, PropsWithChildren } from "react";
import { t } from "ttag";

import { AdminPaneLayout } from "metabase/components/AdminPaneLayout";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Group, Radio } from "metabase/ui";

import { PeopleList } from "../components/PeopleList";
import SearchInput from "../components/SearchInput";
import { USER_STATUS } from "../constants";
import { usePeopleQuery } from "../hooks/use-people-query";

const PAGE_SIZE = 25;

export const PeopleListingApp = ({ children }: PropsWithChildren) => {
  const {
    query,
    status,
    searchInputValue,
    updateSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  } = usePeopleQuery(PAGE_SIZE);

  const isAdmin = useSelector(getUserIsAdmin);

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = e => {
    updateSearchInputValue(e.target.value);
  };

  const headingContent = (
    <div className={cx(CS.mb2, CS.flex, CS.alignCenter)}>
      <SearchInput
        className={cx(CS.textSmall, CS.mr2)}
        type="text"
        placeholder={t`Find someone`}
        value={searchInputValue}
        onChange={handleSearchChange}
        onResetClick={() => updateSearchInputValue("")}
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
    isAdmin && status === USER_STATUS.active ? t`Invite someone` : undefined;

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
};

PeopleListingApp.propTypes = {
  children: PropTypes.node,
  isAdmin: PropTypes.bool,
};
