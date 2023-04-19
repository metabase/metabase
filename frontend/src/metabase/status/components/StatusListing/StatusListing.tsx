import React from "react";
import DatabaseStatus from "../../containers/DatabaseStatus";
import FileUploadStatus from "../FileUploadStatus";
import { StatusListingRoot } from "./StatusListing.styled";

export interface StatusListingProps {
  isAdmin: boolean;
}

const StatusListing = ({ isAdmin }: StatusListingProps): JSX.Element => {
  return (
    <StatusListingRoot>
      {isAdmin && <DatabaseStatus />}
      <FileUploadStatus />
    </StatusListingRoot>
  );
};

export default StatusListing;
