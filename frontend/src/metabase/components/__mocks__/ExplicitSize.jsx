/* eslint-disable react/display-name */
import React from "react";

const ExplicitSize = measureClass => ComposedComponent => props =>
  <ComposedComponent width={1000} height={1000} {...props} />;

export default ExplicitSize;
