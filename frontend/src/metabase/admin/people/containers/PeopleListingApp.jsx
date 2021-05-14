import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import AdminPaneLayout from "metabase/components/AdminPaneLayout";
import Radio from "metabase/components/Radio";

import SearchInput from "../components/SearchInput";
import PeopleList from "../components/PeopleList";
import { USER_STATUS } from "../constants";
import { usePeopleQuery } from "../hooks/use-people-query";

const PAGE_SIZE = 25;

export default function PeopleListingApp({ children }) {
  const {
    query,
    status,
    searchInputValue,
    updateSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  } = usePeopleQuery(PAGE_SIZE);

  const headingContent = (
    <div className="mb2 flex">
      <SearchInput
        className="text-small mr2"
        type="text"
        placeholder={t`Find someone`}
        value={searchInputValue}
        onChange={updateSearchInputValue}
        hasClearButton
      />
      <Radio
        className="ml2 text-bold"
        value={status}
        options={[
          { name: t`Active`, value: USER_STATUS.active },
          { name: t`Deactivated`, value: USER_STATUS.deactivated },
        ]}
        showButtons
        py={1}
        onChange={updateStatus}
      />
    </div>
  );

  return (
    <AdminPaneLayout
      headingContent={headingContent}
      buttonText={status === USER_STATUS.deactivated ? null : t`Invite someone`}
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

PeopleListingApp.propTypes = {
  children: PropTypes.node,
};
