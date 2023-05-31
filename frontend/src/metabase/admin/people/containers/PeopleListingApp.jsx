import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";

import AdminPaneLayout from "metabase/components/AdminPaneLayout";
import Radio from "metabase/core/components/Radio";
import { getUserIsAdmin } from "metabase/selectors/user";

import SearchInput from "../components/SearchInput";
import PeopleList from "../components/PeopleList";
import { USER_STATUS } from "../constants";
import { usePeopleQuery } from "../hooks/use-people-query";

const PAGE_SIZE = 25;

function PeopleListingApp({ children, isAdmin }) {
  const {
    query,
    status,
    searchInputValue,
    updateSearchInputValue,
    updateStatus,
    handleNextPage,
    handlePreviousPage,
  } = usePeopleQuery(PAGE_SIZE);

  const handleSearchChange = e => {
    updateSearchInputValue(e.target.value);
  };

  const headingContent = (
    <div className="mb2 flex align-center">
      <SearchInput
        className="text-small mr2"
        type="text"
        placeholder={t`Find someone`}
        value={searchInputValue}
        onChange={handleSearchChange}
        onResetClick={() => updateSearchInputValue("")}
      />
      {isAdmin && (
        <Radio
          className="ml2 text-bold"
          value={status}
          options={[
            { name: t`Active`, value: USER_STATUS.active },
            { name: t`Deactivated`, value: USER_STATUS.deactivated },
          ]}
          showButtons
          onChange={updateStatus}
        />
      )}
    </div>
  );

  const buttonText =
    isAdmin && status === USER_STATUS.active ? t`Invite someone` : null;

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

PeopleListingApp.propTypes = {
  children: PropTypes.node,
  isAdmin: PropTypes.bool,
};

export default connect(state => ({
  isAdmin: getUserIsAdmin(state),
}))(PeopleListingApp);
