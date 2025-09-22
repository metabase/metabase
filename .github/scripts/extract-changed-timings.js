const extractChangedTimings = ({ oldTimings, newTimings }) => {
  const oldTimingMap =
    oldTimings.durations?.reduce((map, item) => {
      if (item.spec) {
        map[item.spec] = item.duration;
      }
      return map;
    }, {}) || {};

  const changedTimings = { durations: [] };

  if (newTimings.durations) {
    newTimings.durations.forEach((item) => {
      if (!item.spec || typeof item.duration !== "number") {
        return;
      }

      const newSpec = convertPathFormat(item.spec);
      const oldDuration = oldTimingMap[newSpec] || oldTimingMap[item.spec];

      // Include if it's a new spec or the duration has changed
      if (oldDuration === undefined || oldDuration !== item.duration) {
        changedTimings.durations.push({
          spec: newSpec,
          duration: item.duration,
        });
      }
    });
  }

  return {
    changedTimings: changedTimings,
    hasChanges: changedTimings.durations.length > 0,
  };
};

// Convert cypress-split path format to timings.json path format
// from "e2e/test/scenarios/..." to "../test/scenarios/..."
function convertPathFormat(specPath) {
  return specPath.startsWith("e2e/test/")
    ? specPath.replace("e2e/test/", "../test/")
    : specPath;
}

module.exports = { extractChangedTimings };
