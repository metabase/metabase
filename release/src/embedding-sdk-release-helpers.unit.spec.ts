import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  applySdkVersionBump,
  computeNextSdkVersion,
  computeSdkDistTag,
  getSdkMajorVersion,
  shouldSdkTagAsLatest,
  validateBranchReleaseType,
} from "./embedding-sdk-release-helpers";

describe("embedding-sdk-release-helpers", () => {
  describe("getSdkMajorVersion", () => {
    it("takes the second dot-segment, like `cut -d. -f2`", () => {
      expect(getSdkMajorVersion("0.63.0")).toBe("63");
      expect(getSdkMajorVersion("0.63.0-alpha.5")).toBe("63");
      expect(getSdkMajorVersion("0.62.5-data-apps.0")).toBe("62");
    });
  });

  describe("validateBranchReleaseType", () => {
    it("accepts the legal branch x release_type combinations", () => {
      expect(() => validateBranchReleaseType("master", "alpha", "")).not.toThrow();
      expect(() =>
        validateBranchReleaseType("master", "preminor", ""),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType("release-x.63.x", "beta", ""),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType("release-x.63.x", "patch", ""),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType("data-apps", "custom", "data-apps"),
      ).not.toThrow();
    });

    it("rejects release types that don't belong to the branch", () => {
      expect(() => validateBranchReleaseType("master", "beta", "")).toThrow(
        /Only 'alpha' or 'preminor'/,
      );
      expect(() =>
        validateBranchReleaseType("release-x.63.x", "alpha", ""),
      ).toThrow(/Only 'beta' or 'patch'/);
      expect(() => validateBranchReleaseType("data-apps", "patch", "")).toThrow(
        /only release_type=custom is allowed/,
      );
    });

    it("rejects prerelease_id on a non-custom release type", () => {
      expect(() =>
        validateBranchReleaseType("master", "alpha", "data-apps"),
      ).toThrow(/prerelease_id is only used with release_type=custom/);
    });

    it("rejects the reserved alpha/beta ids for custom", () => {
      expect(() =>
        validateBranchReleaseType("data-apps", "custom", "alpha"),
      ).toThrow(/reserved for master\/release-branch/);
      expect(() =>
        validateBranchReleaseType("data-apps", "custom", "beta"),
      ).toThrow(/reserved for master\/release-branch/);
    });

    it("rejects a malformed custom id", () => {
      expect(() =>
        validateBranchReleaseType("data-apps", "custom", "Data_Apps"),
      ).toThrow(/must be lowercase/);
    });
  });

  describe("computeNextSdkVersion", () => {
    it("alpha bumps the prerelease counter", () => {
      expect(computeNextSdkVersion("0.63.0-alpha.5", "alpha", "")).toBe(
        "0.63.0-alpha.6",
      );
      expect(computeNextSdkVersion("0.63.0-alpha", "alpha", "")).toBe(
        "0.63.0-alpha.0",
      );
    });

    it("beta bumps the prerelease counter", () => {
      expect(computeNextSdkVersion("0.63.0-beta.1", "beta", "")).toBe(
        "0.63.0-beta.2",
      );
      expect(computeNextSdkVersion("0.63.0-beta", "beta", "")).toBe(
        "0.63.0-beta.0",
      );
    });

    it("preminor moves master to the next major's alpha", () => {
      expect(computeNextSdkVersion("0.63.0-alpha.5", "preminor", "")).toBe(
        "0.64.0-alpha.0",
      );
    });

    it("patch graduates a beta and then climbs", () => {
      expect(computeNextSdkVersion("0.63.0-beta.2", "patch", "")).toBe("0.63.0");
      expect(computeNextSdkVersion("0.63.0", "patch", "")).toBe("0.63.1");
    });

    describe("custom", () => {
      it("first cut uses the supplied id (alpha/beta on the branch is still a first cut)", () => {
        expect(
          computeNextSdkVersion("0.63.0-alpha.5", "custom", "data-apps"),
        ).toBe("0.63.0-data-apps.0");
      });

      it("later bump reuses the id already in the version", () => {
        expect(
          computeNextSdkVersion("0.62.5-data-apps.0", "custom", ""),
        ).toBe("0.62.5-data-apps.1");
        expect(
          computeNextSdkVersion("0.62.5-data-apps.1", "custom", ""),
        ).toBe("0.62.5-data-apps.2");
      });

      it("errors when the branch already carries an id and one is also supplied", () => {
        expect(() =>
          computeNextSdkVersion("0.62.5-data-apps.0", "custom", "data-apps"),
        ).toThrow(/already uses the prerelease id 'data-apps'/);
      });

      it("errors when neither an existing nor a supplied id is present", () => {
        expect(() =>
          computeNextSdkVersion("0.63.0-alpha.5", "custom", ""),
        ).toThrow(/prerelease_id is required when cutting a new one-off branch/);
      });
    });

    it("rejects an unsupported release type", () => {
      expect(() =>
        // @ts-expect-error - exercising the runtime guard
        computeNextSdkVersion("0.63.0", "nonsense", ""),
      ).toThrow(/Unsupported release_type/);
    });
  });

  describe("computeSdkDistTag", () => {
    it("maps each release type to its real dist-tag", () => {
      expect(computeSdkDistTag("0.63.0-alpha.6", "alpha", "63")).toBe("alpha");
      expect(computeSdkDistTag("0.64.0-alpha.0", "preminor", "64")).toBe("alpha");
      expect(computeSdkDistTag("0.63.0-beta.0", "beta", "63")).toBe("63-beta");
      expect(computeSdkDistTag("0.63.0", "patch", "63")).toBe("63-stable");
      expect(computeSdkDistTag("0.62.5-data-apps.0", "custom", "62")).toBe(
        "62-data-apps",
      );
    });

    it("errors when a custom version has no readable prerelease id", () => {
      expect(() => computeSdkDistTag("0.63.0", "custom", "63")).toThrow(
        /Could not read a prerelease id/,
      );
    });
  });

  describe("shouldSdkTagAsLatest", () => {
    it("is true only when patching the current gold major on a release branch", () => {
      expect(shouldSdkTagAsLatest("patch", "release-x.63.x", "63", "63")).toBe(
        true,
      );
    });

    it("is false for every other combination", () => {
      // not a patch
      expect(shouldSdkTagAsLatest("beta", "release-x.63.x", "63", "63")).toBe(
        false,
      );
      // not a release branch
      expect(shouldSdkTagAsLatest("patch", "master", "63", "63")).toBe(false);
      // major is not the current gold major
      expect(shouldSdkTagAsLatest("patch", "release-x.62.x", "62", "63")).toBe(
        false,
      );
      // no latest major set
      expect(
        shouldSdkTagAsLatest("patch", "release-x.63.x", "63", undefined),
      ).toBe(false);
    });
  });

  describe("applySdkVersionBump", () => {
    function writeTemplate(version: string): string {
      const directory = mkdtempSync(join(tmpdir(), "sdk-bump-"));
      const path = join(directory, "package.template.json");
      writeFileSync(
        path,
        JSON.stringify(
          { name: "@metabase/embedding-sdk-react", version, description: "x" },
          null,
          2,
        ) + "\n",
      );
      return path;
    }

    it("alpha bump on master writes the file and returns outputs", () => {
      const path = writeTemplate("0.63.0-alpha.5");

      const result = applySdkVersionBump({
        packageTemplatePath: path,
        branch: "master",
        releaseType: "alpha",
      });

      expect(result).toEqual({
        previousVersion: "0.63.0-alpha.5",
        newVersion: "0.63.0-alpha.6",
        majorVersion: "63",
        distTag: "alpha",
        tagAsLatest: false,
      });

      const written = JSON.parse(readFileSync(path, "utf8"));
      expect(written.version).toBe("0.63.0-alpha.6");
      expect(written.sdkRelease).toEqual({ distTag: "alpha", tagAsLatest: false });
      // other keys are preserved
      expect(written.name).toBe("@metabase/embedding-sdk-react");
      expect(written.description).toBe("x");
    });

    it("beta on a release branch", () => {
      const path = writeTemplate("0.63.0-beta.1");

      expect(
        applySdkVersionBump({
          packageTemplatePath: path,
          branch: "release-x.63.x",
          releaseType: "beta",
        }),
      ).toEqual({
        previousVersion: "0.63.0-beta.1",
        newVersion: "0.63.0-beta.2",
        majorVersion: "63",
        distTag: "63-beta",
        tagAsLatest: false,
      });
    });

    it("patch that graduates to gold and takes latest", () => {
      const path = writeTemplate("0.63.0-beta.2");

      const result = applySdkVersionBump({
        packageTemplatePath: path,
        branch: "release-x.63.x",
        releaseType: "patch",
        latestMajorVersion: "63",
      });

      expect(result).toEqual({
        previousVersion: "0.63.0-beta.2",
        newVersion: "0.63.0",
        majorVersion: "63",
        distTag: "63-stable",
        tagAsLatest: true,
      });
      expect(JSON.parse(readFileSync(path, "utf8")).sdkRelease).toEqual({
        distTag: "63-stable",
        tagAsLatest: true,
      });
    });

    it("patch on an older release branch does not take latest", () => {
      const path = writeTemplate("0.62.0");

      expect(
        applySdkVersionBump({
          packageTemplatePath: path,
          branch: "release-x.62.x",
          releaseType: "patch",
          latestMajorVersion: "63",
        }),
      ).toEqual({
        previousVersion: "0.62.0",
        newVersion: "0.62.1",
        majorVersion: "62",
        distTag: "62-stable",
        tagAsLatest: false,
      });
    });

    it("custom first cut on a one-off branch", () => {
      const path = writeTemplate("0.63.0-alpha.5");

      expect(
        applySdkVersionBump({
          packageTemplatePath: path,
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "data-apps",
        }),
      ).toEqual({
        previousVersion: "0.63.0-alpha.5",
        newVersion: "0.63.0-data-apps.0",
        majorVersion: "63",
        distTag: "63-data-apps",
        tagAsLatest: false,
      });
    });

    it("propagates validation errors without writing the file", () => {
      const path = writeTemplate("0.63.0-alpha.5");

      expect(() =>
        applySdkVersionBump({
          packageTemplatePath: path,
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "beta",
        }),
      ).toThrow(/reserved for master\/release-branch/);
      // the file is untouched on a validation failure
      expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(
        "0.63.0-alpha.5",
      );
    });
  });
});
