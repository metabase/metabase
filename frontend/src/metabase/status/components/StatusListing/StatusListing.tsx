import React from "react";
import DatabaseStatus from "../../containers/DatabaseStatus";
import { StatusListingRoot } from "./StatusListing.styled";

interface Props {
  isAdmin: boolean;
}

const StatusListing = ({ isAdmin }: Props): JSX.Element => {
  return <StatusListingRoot>{isAdmin && <DatabaseStatus />}</StatusListingRoot>;
};

export default StatusListing;
