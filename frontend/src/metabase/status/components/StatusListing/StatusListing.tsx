import React from "react";
import DatabaseStatus from "../../containers/DatabaseStatus";
import { StatusListingRoot } from "./StatusListing.styled";

export interface StatusListingProps {
  isAdmin: boolean;
}

const StatusListing = ({ isAdmin }: StatusListingProps): JSX.Element => {
  return <StatusListingRoot>{isAdmin && <DatabaseStatus />}</StatusListingRoot>;
};

export default StatusListing;
