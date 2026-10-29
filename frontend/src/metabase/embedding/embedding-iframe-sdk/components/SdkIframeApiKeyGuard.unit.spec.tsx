import { render, screen } from "__support__/ui";

import { SdkIframeApiKeyGuard } from "./SdkIframeApiKeyGuard";

const setup = ({
  apiKey,
  parentOrigin,
}: {
  apiKey?: string;
  parentOrigin: string | null;
}) =>
  render(
    <SdkIframeApiKeyGuard apiKey={apiKey} parentOrigin={parentOrigin}>
      <div>Embed content</div>
    </SdkIframeApiKeyGuard>,
  );

describe("SdkIframeApiKeyGuard", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:5000",
    "http://[::1]:4000",
  ])("allows API keys from %s", (parentOrigin) => {
    setup({ apiKey: "development-key", parentOrigin });

    expect(screen.getByText("Embed content")).toBeInTheDocument();
  });

  it.each(["https://host.example.com", "null", null])(
    "rejects API keys from %s",
    (parentOrigin) => {
      setup({ apiKey: "development-key", parentOrigin });

      expect(
        screen.getByText("Using an API key in production is not allowed."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Embed content")).not.toBeInTheDocument();
    },
  );

  it("allows embeds without an API key outside localhost", () => {
    setup({ parentOrigin: "https://host.example.com" });

    expect(screen.getByText("Embed content")).toBeInTheDocument();
  });
});
