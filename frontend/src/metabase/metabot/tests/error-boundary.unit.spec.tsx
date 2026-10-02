import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup } from "./utils";

let mockShouldThrow = false;
let mockShouldFailChunkLoad = false;

// Stand in for the chunk fetch. The factory reads the mocked module below, so a
// test can make the panel throw on render or the fetch fail, one at a time.
jest.mock("../components/MetabotChat/lazy", () => {
  const { lazy } = jest.requireActual("react");
  return {
    prefetchMetabotChat: jest.fn(),
    createLazyMetabotChat: () =>
      lazy(() =>
        mockShouldFailChunkLoad
          ? Promise.reject(new Error("Test chunk load failure"))
          : Promise.resolve({
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              default: require("../components/MetabotChat/MetabotChat")
                .MetabotChat,
            }),
      ),
  };
});

// The lazy loader imports the module, not the barrel, so mock the module.
jest.mock("../components/MetabotChat/MetabotChat", () => {
  const metabotChatModule = jest.requireActual(
    "../components/MetabotChat/MetabotChat",
  );
  return {
    ...metabotChatModule,
    MetabotChat: (props: any) => {
      if (mockShouldThrow) {
        throw new Error("Test error for ErrorBoundary");
      }
      return <metabotChatModule.MetabotChat {...props} />;
    },
  };
});

describe("metabot error boundary", () => {
  beforeEach(() => {
    mockShouldThrow = false;
    mockShouldFailChunkLoad = false;
  });

  it("should show error fallback and recover when clicking try again", async () => {
    // prevent large amount of error content to get logged for our expected errors
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockShouldThrow = true;

    setup();

    // Error fallback should be shown
    expect(
      await screen.findByTestId("metabot-error-fallback"),
    ).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();

    // MetabotChat should not be visible
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();

    // Allow recovery on next render
    mockShouldThrow = false;

    await userEvent.click(screen.getByTestId("metabot-error-retry"));
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-error-fallback"),
    ).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("should recover when the panel chunk fails to load", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockShouldFailChunkLoad = true;

    setup();

    expect(
      await screen.findByTestId("metabot-error-fallback"),
    ).toBeInTheDocument();

    // React.lazy re-throws a rejected import forever, so retrying has to build a
    // new component rather than re-render the one that failed.
    mockShouldFailChunkLoad = false;

    await userEvent.click(screen.getByTestId("metabot-error-retry"));
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
