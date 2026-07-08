const extractChangedTimings = ({ oldTimings, newTimings }) => {
  const oldTimingMap =
    oldTimings.durations?.reduce((map, item) => {
      if (item.spec) {
        map[item.spec] = item.duration;
      }
      return map;
    }, {}) || {};

  const changedDurations = newTimings.durations
    .filter((item) => {
      if (!item || !item.spec || typeof item.duration !== "number") {
        return false;
      }
      const newSpec = convertPathFormat(item.spec);
      const oldDuration = oldTimingMap[newSpec] || oldTimingMap[item.spec];
      // Include if it's a new spec or the duration has changed
      return oldDuration === undefined || oldDuration !== item.duration;
    })
    .map((item) => ({
      spec: convertPathFormat(item.spec),
      duration: item.duration,
    }));

  return {
    changedTimings: { durations: changedDurations },
    hasChanges: changedDurations.length > 0,
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
