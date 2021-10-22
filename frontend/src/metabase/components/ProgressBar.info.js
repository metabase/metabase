import React from "react";

import ProgressBar from "metabase/components/ProgressBar";

export const component = ProgressBar;
export const category = "feedback";

export const description = `
Progress bar.
`;
export const examples = {
  Default: <ProgressBar percentage={0.75} />,
  Animated: <ProgressBar percentage={0.35} animated />,
};
