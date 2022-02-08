/* eslint-disable react/prop-types */
import React from "react";

import Subhead from "metabase/components/type/Subhead";
import { ViewSectionRoot } from "metabase/query_builder/components/view/ViewSection.styled";

const ViewSection = ({ className, style, children }) => (
  <ViewSectionRoot className={className} style={style}>
    {children}
  </ViewSectionRoot>
);

export const ViewHeading = ({ ...props }) => <Subhead {...props} />;

export const ViewSubHeading = ({ ...props }) => (
  <div className="text-medium text-bold" {...props} />
);

export default ViewSection;
