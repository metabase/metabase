import { render, screen } from "__support__/ui";

import { UnsupportedReactVersionError } from "./UnsupportedReactVersionError";

// React 18 because MINIMUM_SUPPORTED_REACT_MAJOR_VERSION in host-react-version.ts
// is 19. When that moves to 20, fake 19 here and update the message.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  version: "18.3.1",
}));

const UNSUPPORTED_REACT_MESSAGE =
  "The Metabase modular embedding SDK requires React 19 or newer, but this application is running React 18. Upgrade your application to React 19 to display embedded content.";

describe("UnsupportedReactVersionError", () => {
  it("shows the unsupported React message and logs it to the console", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(<UnsupportedReactVersionError />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      UNSUPPORTED_REACT_MESSAGE,
    );
    expect(consoleError).toHaveBeenCalledWith(UNSUPPORTED_REACT_MESSAGE);

    consoleError.mockRestore();
  });
});
