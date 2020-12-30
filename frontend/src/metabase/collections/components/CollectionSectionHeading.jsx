import React from "react";
import { color } from "metabase/lib/colors";

export default function CollectionSectionHeading({ children }) {
  return (
    <h5
      className="text-uppercase mb2"
      style={{ color: color("text-medium"), fontWeight: 900 }}
    >
      {children}
    </h5>
  );
}
