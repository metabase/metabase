import { setupSettingEndpoint } from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { VersionInfo } from "metabase-types/api";
import {
  createMockMajorVersionSupport,
  createMockSettings,
  createMockVersion,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { useGetVersionInfoQuery } from "./api";
import { useEolDate } from "./use-eol-date";

const VERSION = "v1.56.3";
const NO_EOL = { eolDate: null, isEol: false };

async function setup({
  versionTag = VERSION,
  versionInfo,
}: {
  versionTag?: string;
  versionInfo: VersionInfo;
}) {
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: versionInfo,
  });

  const { result } = renderHookWithProviders(
    () => ({
      eol: useEolDate(),
      isLoaded: useGetVersionInfoQuery().isSuccess,
    }),
    {
      storeInitialState: {
        settings: createMockSettingsState(
          createMockSettings({
            version: createMockVersion({ tag: versionTag }),
          }),
        ),
      },
    },
  );

  // Wait for version-info so a null result can't come from loading state
  await waitFor(() => expect(result.current.isLoaded).toBe(true));

  return result.current.eol;
}

describe("useEolDate", () => {
  it("returns null when major_version_support is missing", async () => {
    expect(await setup({ versionInfo: createMockVersionInfo() })).toEqual(
      NO_EOL,
    );
  });

  it("returns null when major_version_support is empty", async () => {
    expect(
      await setup({
        versionInfo: createMockVersionInfo({ major_version_support: [] }),
      }),
    ).toEqual(NO_EOL);
  });

  it("returns null when there is no row for the current major", async () => {
    expect(
      await setup({
        versionInfo: createMockVersionInfo({
          major_version_support: [
            createMockMajorVersionSupport({ major: 54, eol: "2027-06-01" }),
          ],
        }),
      }),
    ).toEqual(NO_EOL);
  });

  it("returns null when eol is not a valid date", async () => {
    expect(
      await setup({
        versionInfo: createMockVersionInfo({
          major_version_support: [
            createMockMajorVersionSupport({ major: 56, eol: "not-a-date" }),
          ],
        }),
      }),
    ).toEqual(NO_EOL);
  });

  it.each(["", "notaversion", "vLOCAL_DEV"])(
    "returns null for version tag %p",
    async (versionTag) => {
      expect(
        await setup({
          versionTag,
          versionInfo: createMockVersionInfo({
            major_version_support: [
              createMockMajorVersionSupport({ major: 56 }),
            ],
          }),
        }),
      ).toEqual(NO_EOL);
    },
  );

  it("returns UTC midnight of the matching eol date", async () => {
    const { eolDate } = await setup({
      versionInfo: createMockVersionInfo({
        major_version_support: [
          createMockMajorVersionSupport({ major: 56, eol: "2027-06-01" }),
        ],
      }),
    });

    expect(eolDate?.toISOString()).toBe("2027-06-01T00:00:00.000Z");
  });

  it("uses the latest eol when the same major appears more than once", async () => {
    const { eolDate } = await setup({
      versionInfo: createMockVersionInfo({
        major_version_support: [
          createMockMajorVersionSupport({ major: 56, eol: "2027-06-01" }),
          createMockMajorVersionSupport({ major: 54, eol: "2028-01-01" }),
          createMockMajorVersionSupport({ major: 56, eol: "2027-12-01" }),
        ],
      }),
    });

    expect(eolDate?.toISOString()).toBe("2027-12-01T00:00:00.000Z");
  });

  it("returns isEol false when the eol date is in the future", async () => {
    const { isEol } = await setup({
      versionInfo: createMockVersionInfo({
        major_version_support: [
          createMockMajorVersionSupport({ major: 56, eol: "2999-01-01" }),
        ],
      }),
    });

    expect(isEol).toBe(false);
  });

  it("returns isEol true when the eol date has passed", async () => {
    const { isEol } = await setup({
      versionInfo: createMockVersionInfo({
        major_version_support: [
          createMockMajorVersionSupport({ major: 56, eol: "2020-01-01" }),
        ],
      }),
    });

    expect(isEol).toBe(true);
  });
});
