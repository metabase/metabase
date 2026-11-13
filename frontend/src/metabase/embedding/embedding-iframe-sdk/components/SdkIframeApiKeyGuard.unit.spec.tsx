import { render, screen } from "__support__/ui";

import { SdkIframeApiKeyGuard } from "./SdkIframeApiKeyGuard";

const PRODUCTION_ERROR = "Using an API key in production is not allowed.";

describe("SdkIframeApiKeyGuard", () => {
  it.each([
    { apiKey: "development-key", parentOrigin: "http://localhost:3000" },
    { apiKey: undefined, parentOrigin: "https://host.example.com" },
  ])("renders the embed for $apiKey from $parentOrigin", (props) => {
    render(
      <SdkIframeApiKeyGuard {...props}>
        <div>Embed content</div>
      </SdkIframeApiKeyGuard>,
    );

    expect(screen.getByText("Embed content")).toBeInTheDocument();
    expect(screen.queryByText(PRODUCTION_ERROR)).not.toBeInTheDocument();
  });

  it("refuses an API key from a production host and says why", () => {
    render(
      <SdkIframeApiKeyGuard
        apiKey="development-key"
        parentOrigin="https://host.example.com"
      >
        <div>Embed content</div>
      </SdkIframeApiKeyGuard>,
    );

    expect(screen.getByText(PRODUCTION_ERROR)).toBeInTheDocument();
    expect(screen.queryByText("Embed content")).not.toBeInTheDocument();
  });
});
