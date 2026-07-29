import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  applySdkVersionBump,
  computeNextSdkVersion,
  computeSdkDistTag,
  getSdkMajorVersion,
  readSdkReleaseMetadata,
  shouldSdkTagAsLatest,
  validateBranchReleaseType,
} from "./embedding-sdk-release-helpers";

function writeJsonTemplate(content: object): string {
  const directory = mkdtempSync(join(tmpdir(), "sdk-tpl-"));
  const path = join(directory, "package.template.json");
  writeFileSync(path, JSON.stringify(content, null, 2) + "\n");
  return path;
}

describe("embedding-sdk-release-helpers", () => {
  describe("getSdkMajorVersion", () => {
    it("takes the second dot-segment", () => {
      expect(getSdkMajorVersion("0.63.0")).toBe("63");
      expect(getSdkMajorVersion("0.63.0-alpha.5")).toBe("63");
      expect(getSdkMajorVersion("0.62.5-data-apps.0")).toBe("62");
    });
  });

  describe("validateBranchReleaseType", () => {
    it("accepts the legal branch x release_type combinations", () => {
      expect(() =>
        validateBranchReleaseType({
          branch: "master",
          releaseType: "alpha",
          prereleaseId: "",
        }),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType({
          branch: "master",
          releaseType: "preminor",
          prereleaseId: "",
        }),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType({
          branch: "release-x.63.x",
          releaseType: "beta",
          prereleaseId: "",
        }),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType({
          branch: "release-x.63.x",
          releaseType: "patch",
          prereleaseId: "",
        }),
      ).not.toThrow();
      expect(() =>
        validateBranchReleaseType({
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "data-apps",
        }),
      ).not.toThrow();
      // follow-up release: no prerelease id, reused from the version
      expect(() =>
        validateBranchReleaseType({
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "",
        }),
      ).not.toThrow();
    });

    it("rejects release types that don't belong to the branch", () => {
      expect(() =>
        validateBranchReleaseType({
          branch: "master",
          releaseType: "beta",
          prereleaseId: "",
        }),
      ).toThrow(/Only 'alpha' or 'preminor'/);
      expect(() =>
        validateBranchReleaseType({
          branch: "release-x.63.x",
          releaseType: "alpha",
          prereleaseId: "",
        }),
      ).toThrow(/Only 'beta' or 'patch'/);
      expect(() =>
        validateBranchReleaseType({
          branch: "data-apps",
          releaseType: "patch",
          prereleaseId: "",
        }),
      ).toThrow(/only release_type=custom is allowed/);
    });

    it("rejects prerelease_id on a non-custom release type", () => {
      expect(() =>
        validateBranchReleaseType({
          branch: "master",
          releaseType: "alpha",
          prereleaseId: "data-apps",
        }),
      ).toThrow(/prerelease_id is only used with release_type=custom/);
    });

    it("rejects the reserved alpha/beta ids for custom", () => {
      expect(() =>
        validateBranchReleaseType({
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "alpha",
        }),
      ).toThrow(/reserved for master\/release-branch/);
      expect(() =>
        validateBranchReleaseType({
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "beta",
        }),
      ).toThrow(/reserved for master\/release-branch/);
    });

    it("rejects a malformed custom id", () => {
      expect(() =>
        validateBranchReleaseType({
          branch: "data-apps",
          releaseType: "custom",
          prereleaseId: "Data_Apps",
        }),
      ).toThrow(/must be lowercase/);
    });
  });

  describe("computeNextSdkVersion", () => {
    it("alpha bumps the prerelease counter", () => {
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0-alpha.5",
          releaseType: "alpha",
          prereleaseId: "",
        }),
      ).toBe("0.63.0-alpha.6");
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0-alpha",
          releaseType: "alpha",
          prereleaseId: "",
        }),
      ).toBe("0.63.0-alpha.0");
    });

    it("beta bumps the prerelease counter", () => {
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0-beta.1",
          releaseType: "beta",
          prereleaseId: "",
        }),
      ).toBe("0.63.0-beta.2");
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0-beta",
          releaseType: "beta",
          prereleaseId: "",
        }),
      ).toBe("0.63.0-beta.0");
    });

    it("preminor moves master to the next major's alpha", () => {
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0-alpha.5",
          releaseType: "preminor",
          prereleaseId: "",
        }),
      ).toBe("0.64.0-alpha.0");
    });

    it("patch graduates a beta and then climbs", () => {
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0-beta.2",
          releaseType: "patch",
          prereleaseId: "",
        }),
      ).toBe("0.63.0");
      expect(
        computeNextSdkVersion({
          currentVersion: "0.63.0",
          releaseType: "patch",
          prereleaseId: "",
        }),
      ).toBe("0.63.1");
    });

    describe("custom", () => {
      it("first cut uses the supplied id (alpha/beta on the branch is still a first cut)", () => {
        expect(
          computeNextSdkVersion({
            currentVersion: "0.63.0-alpha.5",
            releaseType: "custom",
            prereleaseId: "data-apps",
          }),
        ).toBe("0.63.0-data-apps.0");
      });

      it("later bump reuses the id already in the version", () => {
        expect(
          computeNextSdkVersion({
            currentVersion: "0.62.5-data-apps.0",
            releaseType: "custom",
            prereleaseId: "",
          }),
        ).toBe("0.62.5-data-apps.1");
        expect(
          computeNextSdkVersion({
            currentVersion: "0.62.5-data-apps.1",
            releaseType: "custom",
            prereleaseId: "",
          }),
        ).toBe("0.62.5-data-apps.2");
      });

      it("errors when the branch already carries an id and one is also supplied", () => {
        expect(() =>
          computeNextSdkVersion({
            currentVersion: "0.62.5-data-apps.0",
            releaseType: "custom",
            prereleaseId: "data-apps",
          }),
        ).toThrow(/already uses the prerelease id 'data-apps'/);
      });

      it("errors when neither an existing nor a supplied id is present", () => {
        // the alpha means this branch was just cut from master, so it's a first
        // cut and needs a supplied id
        expect(() =>
          computeNextSdkVersion({
            currentVersion: "0.63.0-alpha.5",
            releaseType: "custom",
            prereleaseId: "",
          }),
        ).toThrow(/prerelease_id is required when cutting a new one-off branch/);
      });
    });

    it("rejects an unsupported release type", () => {
      expect(() =>
        computeNextSdkVersion({
          currentVersion: "0.63.0",
          // @ts-expect-error - exercising the runtime guard
          releaseType: "nonsense",
          prereleaseId: "",
        }),
      ).toThrow(/Unsupported release_type/);
    });
  });

  describe("computeSdkDistTag", () => {
    it("maps each release type to its real dist-tag", () => {
      expect(
        computeSdkDistTag({ newVersion: "0.63.0-alpha.6", releaseType: "alpha" }),
      ).toBe("alpha");
      expect(
        computeSdkDistTag({
          newVersion: "0.64.0-alpha.0",
          releaseType: "preminor",
        }),
      ).toBe("alpha");
      expect(
        computeSdkDistTag({ newVersion: "0.63.0-beta.0", releaseType: "beta" }),
      ).toBe("63-beta");
      expect(
        computeSdkDistTag({ newVersion: "0.63.0", releaseType: "patch" }),
      ).toBe("63-stable");
      expect(
        computeSdkDistTag({
          newVersion: "0.62.5-data-apps.0",
          releaseType: "custom",
        }),
      ).toBe("62-data-apps");
    });

    it("errors when a custom version has no readable prerelease id", () => {
      expect(() =>
        computeSdkDistTag({ newVersion: "0.63.0", releaseType: "custom" }),
      ).toThrow(/Could not read a prerelease id/);
    });
  });

  describe("shouldSdkTagAsLatest", () => {
    it("is true only when patching the current gold major on a release branch", () => {
      expect(
        shouldSdkTagAsLatest({
          releaseType: "patch",
          branch: "release-x.63.x",
          latestMajorVersion: "63",
        }),
      ).toBe(true);
    });

    it("is false for every other combination", () => {
      // not a patch
      expect(
        shouldSdkTagAsLatest({
          releaseType: "beta",
          branch: "release-x.63.x",
          latestMajorVersion: "63",
        }),
      ).toBe(false);
      // not a release branch
      expect(
        shouldSdkTagAsLatest({
          releaseType: "patch",
          branch: "master",
          latestMajorVersion: "63",
        }),
      ).toBe(false);
      // release branch's major is not the current gold major
      expect(
        shouldSdkTagAsLatest({
          releaseType: "patch",
          branch: "release-x.62.x",
          latestMajorVersion: "63",
        }),
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
        latestMajorVersion: "63",
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
          latestMajorVersion: "63",
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
          latestMajorVersion: "63",
        }),
      ).toEqual({
        previousVersion: "0.63.0-alpha.5",
        newVersion: "0.63.0-data-apps.0",
        majorVersion: "63",
        distTag: "63-data-apps",
        tagAsLatest: false,
      });
    });

    it("custom follow-up release reuses the id already on the branch", () => {
      const path = writeTemplate("0.63.0-data-apps.0");

      expect(
        applySdkVersionBump({
          packageTemplatePath: path,
          branch: "data-apps",
          releaseType: "custom",
          latestMajorVersion: "63",
        }),
      ).toEqual({
        previousVersion: "0.63.0-data-apps.0",
        newVersion: "0.63.0-data-apps.1",
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
          latestMajorVersion: "63",
        }),
      ).toThrow(/reserved for master\/release-branch/);
      // the file is untouched on a validation failure
      expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(
        "0.63.0-alpha.5",
      );
    });
  });

  describe("readSdkReleaseMetadata", () => {
    it("reads the committed version + sdkRelease metadata", () => {
      const path = writeJsonTemplate({
        name: "@metabase/embedding-sdk-react",
        version: "0.63.0",
        sdkRelease: { distTag: "63-stable", tagAsLatest: true },
      });

      expect(readSdkReleaseMetadata({ packageTemplatePath: path })).toEqual({
        version: "0.63.0",
        majorVersion: "63",
        distTag: "63-stable",
        tagAsLatest: true,
      });
    });

    it("defaults tagAsLatest to false when it's absent", () => {
      const path = writeJsonTemplate({
        version: "0.63.0-alpha.6",
        sdkRelease: { distTag: "alpha" },
      });

      expect(readSdkReleaseMetadata({ packageTemplatePath: path })).toEqual({
        version: "0.63.0-alpha.6",
        majorVersion: "63",
        distTag: "alpha",
        tagAsLatest: false,
      });
    });

    it("throws when the sdkRelease distTag is missing", () => {
      const path = writeJsonTemplate({ version: "0.63.0" });

      expect(() =>
        readSdkReleaseMetadata({ packageTemplatePath: path }),
      ).toThrow(/missing sdkRelease\.distTag/);
    });
  });
});
