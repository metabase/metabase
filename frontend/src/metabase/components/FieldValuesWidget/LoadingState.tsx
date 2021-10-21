import React from "react";
import LoadingSpinner from "metabase/components/LoadingSpinner";

export default function LoadingState() {
  return (
    <div
      className="flex layout-centered align-center border-bottom"
      style={{ minHeight: 82 }}
    >
      <LoadingSpinner size={32} />
    </div>
  );
}
