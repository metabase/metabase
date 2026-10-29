import { dataAppOutDir } from "./build-config";

describe("dataAppOutDir", () => {
  it("builds into build/ by default", () => {
    expect(dataAppOutDir({})).toBe("build");
  });

  it("builds into the outDir the user passes", () => {
    expect(dataAppOutDir({ build: { outDir: "dist" } })).toBe("dist");
  });
});
