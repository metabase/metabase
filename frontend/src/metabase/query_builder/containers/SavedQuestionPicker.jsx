import React from "react";
import Icon from "metabase/components/Icon";

export default function SavedQuestionPicker({ onBack, query }) {
  return (
    <div style={{ width: 400 }}>
      <div>
        <span
          onClick={() => onBack()}
          className="text-brand-hover flex align-center"
        >
          <Icon name="chevronleft" />
          Back
        </span>
      </div>
      Saved questions go here
    </div>
  );
}
