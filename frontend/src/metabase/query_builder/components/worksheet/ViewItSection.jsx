import React from "react";
import { t } from "c-3po";

import Button from "metabase/components/Button";

import WorksheetSection from "./WorksheetSection";

const ViewItSection = ({ setMode, runQuestionQuery, style, className }) => {
  return (
    <WorksheetSection style={style} className={className}>
      <div className="flex justify-end">
        <Button
          primary
          onClick={async () => {
            setMode("present");
            runQuestionQuery();
          }}
        >
          {t`View it`}
        </Button>
      </div>
    </WorksheetSection>
  );
};

export default ViewItSection;
