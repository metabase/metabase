const fs = require("fs");

const extractChangedTimings = ({ oldTimings, newTimings }) => {
  const oldTimingMap = {};
  oldTimings.durations?.forEach((item) => {
    if (item.spec) {
      oldTimingMap[item.spec] = item.duration;
    }
  });

  const changedTimings = { durations: [] };

  if (newTimings.durations) {
    newTimings.durations.forEach((item) => {
      if (!item.spec || typeof item.duration !== "number") {
        return;
      }

      const oldDuration = oldTimingMap[item.spec];

      // Include if it's a new spec of the duration has changed
      if (oldDuration === undefined || oldDuration !== item.duration) {
        changedTimings.durations.push(item);
      }
    });
  }

  return {
    changedTimings: changedTimings,
    hasChanges: changedTimings.durations.length > 0,
  };
};

module.exports = { extractChangedTimings };
