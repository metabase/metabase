import React from "react";
import DatabaseStatusListing from "../../containers/DatabaseStatusListing";
import { StatusListingRoot } from "./StatusListing.styled";

interface Props {
  isAdmin: boolean;
}

const StatusListing = ({ isAdmin }: Props) => {
  return (
    <StatusListingRoot>
      {isAdmin && <DatabaseStatusListing />}
    </StatusListingRoot>
  );
};

export default StatusListing;
