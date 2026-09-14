import { render, screen } from "__support__/ui";

import { UnsupportedReactVersionError } from "./UnsupportedReactVersionError";

jest.mock("embedding-sdk-bundle/lib/host-react-version", () => ({
  MINIMUM_SUPPORTED_REACT_MAJOR_VERSION: 19,
  getHostReactMajorVersion: () => 18,
}));

const EXPECTED_MESSAGE =
  "The Metabase modular embedding SDK requires React 19 or newer, but this application is running React 18. Upgrade your application to React 19 to display embedded content.";

describe("UnsupportedReactVersionError", () => {
  // Runs first: the once-per-page console guard is module state, so a
  // render in an earlier test would already have consumed it.
  it("logs the message to the console once across renders", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(<UnsupportedReactVersionError />);
    render(<UnsupportedReactVersionError />);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(EXPECTED_MESSAGE);

    consoleError.mockRestore();
  });

  it("names the required and the detected React major versions", () => {
    render(<UnsupportedReactVersionError />);

    expect(screen.getByRole("alert")).toHaveTextContent(EXPECTED_MESSAGE);
  });
});
