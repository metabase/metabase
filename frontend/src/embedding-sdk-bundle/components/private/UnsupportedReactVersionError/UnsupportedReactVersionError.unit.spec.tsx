import { render, screen } from "__support__/ui";
import { logUnsupportedReactVersionOnce } from "embedding-sdk-bundle/lib/host-react-version";

import { UnsupportedReactVersionError } from "./UnsupportedReactVersionError";

const MESSAGE = "unsupported React message";

jest.mock("embedding-sdk-bundle/lib/host-react-version", () => ({
  getUnsupportedReactVersionMessage: () => "unsupported React message",
  logUnsupportedReactVersionOnce: jest.fn(),
}));

describe("UnsupportedReactVersionError", () => {
  it("shows the unsupported React message", () => {
    render(<UnsupportedReactVersionError />);

    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGE);
  });

  it("logs the unsupported React message to the console", () => {
    render(<UnsupportedReactVersionError />);

    expect(logUnsupportedReactVersionOnce).toHaveBeenCalled();
  });
});
