import { render, screen } from "__support__/ui";

import type * as UnsupportedReactVersionErrorModule from "./UnsupportedReactVersionError";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  version: "18.3.1",
}));

const UNSUPPORTED_REACT_MESSAGE =
  "The Metabase modular embedding SDK requires React 19 or newer, but this application is running React 18. Upgrade your application to React 19 to display embedded content.";

// The minimum is read once, when the module loads, so it is set before that.
function loadWithMinimum(minimum: string) {
  process.env.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION = minimum;

  let unsupportedReactVersionError:
    | typeof UnsupportedReactVersionErrorModule
    | undefined;
  jest.isolateModules(() => {
    unsupportedReactVersionError = jest.requireActual<
      typeof UnsupportedReactVersionErrorModule
    >("./UnsupportedReactVersionError");
  });

  if (!unsupportedReactVersionError) {
    throw new Error("UnsupportedReactVersionError did not load");
  }

  return unsupportedReactVersionError;
}

describe("UnsupportedReactVersionError", () => {
  const originalMinimum = process.env.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION;

  afterEach(() => {
    process.env.EMBEDDING_SDK_MINIMUM_REACT_MAJOR_VERSION = originalMinimum;
  });

  it("shows the unsupported React message and logs it to the console", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { UnsupportedReactVersionError } = loadWithMinimum("19");

    render(<UnsupportedReactVersionError />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      UNSUPPORTED_REACT_MESSAGE,
    );
    expect(consoleError).toHaveBeenCalledWith(UNSUPPORTED_REACT_MESSAGE);

    consoleError.mockRestore();
  });
});
