import { screen } from "__support__/ui";
import { setup } from "./setup";

describe("HomeHelpCard (OSS)", () => {
  it("should render correctly", () => {
    setup();
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should show Metabase despite customizing the application name", () => {
    setup({ applicationName: "My app analytics" });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should render despite hiding the Metabase links", () => {
    setup({ showMetabaseLinks: false });
    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });
});
