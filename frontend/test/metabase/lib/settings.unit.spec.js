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
    "v0.41.0",
    "v0.41.1-SNAPSHOT",
    "v0.41.2-rc1",
    "v0.41.3-RC2",
    "v1.41.4",
    "v1.41.3-SNAPSHOT",
    "v1.41.2-rc1",
    "v1.41.1-RANDOM-SUFFIX",
  ].forEach(v => {
    it("handles version " + v + " correctly", () => {
      withTempSetting("version", { tag: v }, () => {
        expect(MetabaseSettings.docsUrl()).toBe(
          "https://www.metabase.com/docs/v0.41/",
        );
      });
    });
  });
});
