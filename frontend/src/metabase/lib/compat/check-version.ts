import React from "react";

export const getMajorReactVersion = () => {
  const versionParts = React.version.split(".").map(Number);

  return versionParts[0];
};
