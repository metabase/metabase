import { render, screen } from "__support__/ui";

import { PreviewPane } from "./PreviewPane";

const MOCK_PREVIEW_URL = "https://www.example.com/";

type MockPreviewPaneProps = {
  isTransparent?: boolean;
  hidden?: boolean;
};

const setup = ({
  isTransparent = false,
  hidden = false,
}: MockPreviewPaneProps = {}) => {
  render(
    <PreviewPane
      previewUrl={MOCK_PREVIEW_URL}
      isTransparent={isTransparent}
      hidden={hidden}
    />,
  );
};

describe("PreviewPane", () => {
  it("should render the iframe with the provided previewUrl", () => {
    setup();
    const iframe = screen.getByTestId("embed-preview-iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", MOCK_PREVIEW_URL);
  });

  it("should set the iframe attributes correctly", () => {
    setup();
    const iframe = screen.getByTestId("embed-preview-iframe");
    expect(iframe).toHaveAttribute("frameBorder", "0");
  });

  it("should not render the container if hidden is true", () => {
    setup({ hidden: true });
    expect(screen.getByTestId("preview-pane-container")).not.toBeVisible();
  });
});
