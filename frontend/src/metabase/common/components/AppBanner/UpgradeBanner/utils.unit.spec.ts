import type { AlertUpgradeVersion } from "metabase-types/api";
import { createMockVersionInfo } from "metabase-types/api/mocks";

import { getAlertUpgradeVersion } from "./utils";

const entry = (
  opts: Partial<AlertUpgradeVersion> &
    Pick<AlertUpgradeVersion, "min" | "fixed">,
): AlertUpgradeVersion => ({
  message: `${opts.min} -> ${opts.fixed}`,
  ...opts,
});

describe("getAlertUpgradeVersion", () => {
  it("returns undefined when no ranges match", () => {
    expect(
      getAlertUpgradeVersion(
        "v0.63.10",
        createMockVersionInfo({
          alert_upgrade_versions: [
            entry({ min: "v0.63.0", fixed: "v0.63.10" }),
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("returns the matching range", () => {
    const matching = entry({ min: "v0.63.0", fixed: "v0.63.10" });

    expect(
      getAlertUpgradeVersion(
        "v0.63.5",
        createMockVersionInfo({
          alert_upgrade_versions: [matching],
        }),
      ),
    ).toEqual(matching);
  });

  it("picks the matching range with the highest fixed when ranges overlap", () => {
    const lowerFixed = entry({ min: "v0.63.0", fixed: "v0.63.10" });
    const higherFixed = entry({ min: "v0.50.0", fixed: "v0.64.0" });

    expect(
      getAlertUpgradeVersion(
        "v0.63.5",
        createMockVersionInfo({
          alert_upgrade_versions: [lowerFixed, higherFixed],
        }),
      ),
    ).toEqual(higherFixed);
  });

  it("skips entries whose min/fixed cannot be compared to the version tag", () => {
    const invalid = entry({ min: "not-a-version", fixed: "also-bad" });
    const valid = entry({ min: "v0.63.0", fixed: "v0.63.10" });

    expect(
      getAlertUpgradeVersion(
        "v0.63.5",
        createMockVersionInfo({
          alert_upgrade_versions: [invalid, valid],
        }),
      ),
    ).toEqual(valid);
  });

  it("skips a matching-min range when compareVersions cannot parse fixed", () => {
    const first = entry({ min: "v0.0.0", fixed: "v0.63.10" });
    const second = entry({ min: "v0.0.0", fixed: "vLOCAL_DEV" });

    expect(
      getAlertUpgradeVersion(
        "v0.50.0",
        createMockVersionInfo({
          alert_upgrade_versions: [first, second],
        }),
      ),
    ).toEqual(first);
  });
});
