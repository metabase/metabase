import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import AdminPaneLayout from "metabase/components/AdminPaneLayout";
import Radio from "metabase/components/Radio";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import SearchInput from "../components/SearchInput";
import PeopleList from "../components/PeopleList";
import { USER_STATUS } from "../const";

const MIN_QUERY_LENGTH = 2;

export default function PeopleListingApp({ children }) {
  const [status, setStatus] = useState(USER_STATUS.active);
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearchValue = useDebouncedValue(
    searchValue,
    SEARCH_DEBOUNCE_DURATION,
  );
  const searchQuery =
    debouncedSearchValue.length >= MIN_QUERY_LENGTH ? debouncedSearchValue : "";

  const handleFilterChange = value => setStatus(value);
  const handleQueryChange = value => setSearchValue(value);

  const headingContent = (
    <div className="mb2 flex">
      <SearchInput
        className="text-small mr2"
        type="text"
        placeholder={t`Find someone`}
        value={searchValue}
        onChange={handleQueryChange}
        clearButton
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
        onChange={handleFilterChange}
      />
    </div>
  );

  return (
    <AdminPaneLayout
      headingContent={headingContent}
      buttonText={status === USER_STATUS.deactivated ? null : t`Invite someone`}
      buttonLink={Urls.newUser()}
    >
      <PeopleList searchQuery={searchQuery} status={status} />
      {children}
    </AdminPaneLayout>
  );
}

PeopleListingApp.propTypes = {
  children: PropTypes.node,
};
