import React from "react";

import Button from "metabase/components/Button";

import WorksheetSection from "./WorksheetSection";

const ViewItSection = ({ setMode }) => {
  return (
    <WorksheetSection>
      <div className="flex justify-end">
        <Button primary onClick={() => setMode("present")}>
          View it
        </Button>
      </div>
    </WorksheetSection>
  );
};

export default ViewItSection;
