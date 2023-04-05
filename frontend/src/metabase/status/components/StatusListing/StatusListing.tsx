import React from "react";
import Database from "metabase-lib/metadata/Database";
import DatabaseStatus from "../../containers/DatabaseStatus";
import FileUploadStatus from "../FileUploadStatus";
import { StatusListingRoot } from "./StatusListing.styled";

export interface StatusListingProps {
  isAdmin: boolean;
  database: Database;
}

const StatusListing = ({
  isAdmin,
  database: uploadDatabase,
}: StatusListingProps): JSX.Element => {
  return (
    <StatusListingRoot>
      {isAdmin && <DatabaseStatus />}
      {uploadDatabase?.canWrite() && <FileUploadStatus />}
    </StatusListingRoot>
  );
};

export default StatusListing;
