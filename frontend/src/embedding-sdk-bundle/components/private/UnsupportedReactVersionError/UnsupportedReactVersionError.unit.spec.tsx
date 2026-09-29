import { render, screen } from "__support__/ui";

import { UnsupportedReactVersionError } from "./UnsupportedReactVersionError";

// React 17 because MINIMUM_SUPPORTED_REACT_MAJOR_VERSION in host-react-version.ts
// is 18. When that moves to 19, fake 18 here and update the message.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  version: "17.0.2",
}));

const UNSUPPORTED_REACT_MESSAGE =
  "The Metabase modular embedding SDK requires React 18 or newer, but this application is running React 17. Upgrade your application to React 18 to display embedded content.";

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
