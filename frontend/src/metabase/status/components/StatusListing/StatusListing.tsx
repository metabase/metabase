import React from "react";
import { connect } from "react-redux";

import { getUserIsAdmin, getUser } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import DatabaseStatus from "../../containers/DatabaseStatus";
import FileUploadStatus from "../FileUploadStatus";
import { StatusListingRoot } from "./StatusListing.styled";

const mapStateToProps = (state: State) => ({
  isAdmin: getUserIsAdmin(state),
  isLoggedIn: !!getUser(state),
});

export interface StatusListingProps {
  isAdmin: boolean;
  isLoggedIn: boolean;
}

export const StatusListingView = ({
  isAdmin,
  isLoggedIn,
}: StatusListingProps) => {
  if (!isLoggedIn) {
    return null;
  }

  return (
    <StatusListingRoot>
      {isAdmin && <DatabaseStatus />}
      <FileUploadStatus />
    </StatusListingRoot>
  );
};

export default connect(mapStateToProps)(StatusListingView);
