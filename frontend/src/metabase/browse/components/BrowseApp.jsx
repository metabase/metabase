/* eslint-disable react/prop-types */
import React from "react";
import { BrowseAppRoot } from "./BrowseApp.styled";

export default function BrowseApp({ children }) {
  return <BrowseAppRoot>{children}</BrowseAppRoot>;
}
