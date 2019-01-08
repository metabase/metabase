import React from "react";

import DisplayPicker from "../visualize/DisplayPicker";

const DisplayHeader = ({ question, setDisplayFn }) =>
  question ? (
    <div className="flex layout-centered mt1">
      <DisplayPicker value={question.display()} onChange={setDisplayFn} />
    </div>
  ) : null;

export default DisplayHeader;
