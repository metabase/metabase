import { dataAppOutDir } from "./build-config";

describe("dataAppOutDir", () => {
  it("builds into dist/ by default", () => {
    expect(dataAppOutDir({})).toBe("dist");
  });

  it("builds into the outDir the user passes", () => {
    expect(dataAppOutDir({ build: { outDir: "build" } })).toBe("build");
  });
});
