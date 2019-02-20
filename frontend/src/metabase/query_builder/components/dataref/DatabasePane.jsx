import React from "react";

import MainPane from "./MainPane";

const DatabasePane = ({ database, ...props }) => (
  <MainPane {...props} databases={[database]} />
);

export default DatabasePane;
