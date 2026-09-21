import { buildMcpAppsTheme } from "./buildMcpAppsTheme";

describe("buildMcpAppsTheme", () => {
  it("applies ChatGPT dark theme overrides", () => {
    expect(
      buildMcpAppsTheme({
        hostCssVariables: {},
        preset: "dark",
        agentName: "chatgpt",
      }),
    ).toEqual({
      preset: "dark",
      colors: {
        background: "#212121",
        "background-secondary": "#181818",
      },
    });
  });

  it("lets host variables override ChatGPT theme defaults", () => {
    expect(
      buildMcpAppsTheme({
        hostCssVariables: {
          "--color-background-primary": "#000000",
        },
        preset: "dark",
        agentName: "chatgpt",
      }).colors,
    ).toEqual(
      expect.objectContaining({
        background: "#000000",
        "background-secondary": "#181818",
      }),
    );
  });
});
