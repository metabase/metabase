import React from "react";
import QueryBuilder from "./QueryBuilder";

const MetabotPage = props => {
  return <QueryBuilder {...props} initOptions={{ type: "native" }} />;
};

export default MetabotPage;
