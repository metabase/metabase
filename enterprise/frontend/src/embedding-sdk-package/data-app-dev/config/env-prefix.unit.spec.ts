import { dataAppEnvPrefix } from "./env-prefix";

describe("dataAppEnvPrefix", () => {
  it("exposes the app's DATA_APP_ env vars in the dev preview (serve)", () => {
    expect(dataAppEnvPrefix("serve")).toEqual(["DATA_APP_"]);
  });

  it("exposes no DATA_APP_ env vars in a production build", () => {
    expect(dataAppEnvPrefix("build")).toBeUndefined();
  });
});
