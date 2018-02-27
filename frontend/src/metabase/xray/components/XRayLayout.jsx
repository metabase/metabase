import React from "react";
import { withBackground } from "metabase/hoc/Background";
import PreviewBanner from "metabase/xray/components/PreviewBanner";

// A small wrapper to get consistent page structure
export const XRayPageWrapper = withBackground("bg-slate-extra-light")(
  ({ children }) => (
    <div className="full-height full">
      <PreviewBanner />
      <div className="XRayPageWrapper wrapper pb4 full-height">{children}</div>
    </div>
  ),
);

// A unified heading for XRay pages
export const Heading = ({ heading }) => (
  <h2 className="py3" style={{ color: "#93A1AB" }}>
    {heading}
  </h2>
);
