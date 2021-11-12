import MetabaseSettings from "metabase/lib/settings";

function withTempSetting(settingName, settingValue, thunk) {
  const origVal = MetabaseSettings.get(settingName);
  MetabaseSettings.set(settingName, settingValue);
  try {
    thunk();
  } finally {
    MetabaseSettings.set(settingName, origVal);
  }
}

describe("MetabaseSettings.docsUrl", () => {
  // all of these should point to the same doc URL
  [
    ["v0.41.0", "v0.41"],
    [undefined, "latest"],
    ["v0.41.1-SNAPSHOT", "latest"],
    ["v0.41.2-rc1", "v0.41"],
    ["v0.41.3-RC2", "v0.41"],
    ["v1.41.4", "v0.41"],
    ["v1.41.3-snapshot", "latest"],
    ["v1.41.2-rc1", "v0.41"],
    ["v1.41.1-RANDOM-SUFFIX", "v0.41"],
  ].forEach(v => {
    it("handles version " + v[0] + " by pointing it to " + v[1], () => {
      withTempSetting("version", { tag: v[0] }, () => {
        expect(MetabaseSettings.docsUrl()).toBe(
          "https://www.metabase.com/docs/" + v[1] + "/",
        );
      });
    });
  });
});
