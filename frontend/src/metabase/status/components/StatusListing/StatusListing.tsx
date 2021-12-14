import React from "react";
import DatabaseStatus from "../../containers/DatabaseStatus";
import { StatusListingRoot } from "./StatusListing.styled";

interface Props {
  isAdmin: boolean;
}

const StatusListing = ({ isAdmin }: Props) => {
  return <StatusListingRoot>{isAdmin && <DatabaseStatus />}</StatusListingRoot>;
};

export default StatusListing;
