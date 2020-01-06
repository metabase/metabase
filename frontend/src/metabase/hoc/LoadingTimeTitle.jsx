import React from "react";

import { delay } from "metabase/lib/promise";
import title from "metabase/hoc/Title";

export default startTimePropName => ComposedComponent =>
  title(({ [startTimePropName]: startTime }) => {
    if (startTime == null) {
      return "";
    }
    const totalSeconds = (performance.now() - startTime) / 1000;
    const title =
      totalSeconds < 10
        ? "" // don't display the title until >=10 seconds
        : [totalSeconds / 60, totalSeconds % 60] // minutes, seconds
            .map(Math.floor) // round both down
            .map(x => (x < 10 ? `0${x}` : `${x}`)) // pad with "0" to two digits
            .join(":"); // separate with ":"
    return { title, refresh: delay(100) };
  })(
    // remove the start time prop to prevent affecting child components
    ({ [startTimePropName]: _removed, ...props }) => (
      <ComposedComponent {...props} />
    ),
  );
