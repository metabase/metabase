import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";

import { DatabaseFormError } from "./DatabaseFormError";
import {
  type ErrorVariant,
  TestFormErrorProvider,
} from "./test-utils/TestFormErrorProvider";

interface SetupOptions {
  errorVariant?: ErrorVariant;
  errorMessage?: string;
}

const setup = (opts?: SetupOptions) => {
  const { errorVariant, errorMessage } = opts || {};
  const defaultState = createMockState({
    settings: mockSettings({
      "show-metabase-links": true,
      version: { tag: "v1.0.0" },
    }),
  });

  return renderWithProviders(
    <TestFormErrorProvider
      errorMessage={errorMessage}
      errorVariant={errorVariant}
    >
      <DatabaseFormError />
    </TestFormErrorProvider>,
    {
      storeInitialState: defaultState,
    },
  );
};

describe("DatabaseFormError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Generic error", () => {
    const setupOptions: SetupOptions = {
      errorMessage: "Generic error message",
      errorVariant: "generic",
    };

    it("should render the error alert with generic message", () => {
      setup(setupOptions);
      expect(
        within(screen.getByRole("alert")).getByText(
          "Metabase tried, but couldn't connect",
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("alert")).getByText("Generic error message"),
      ).toBeInTheDocument();
    });

    it("should not render the 'Check Host and Port settings' button", () => {
      setup(setupOptions);
      expect(
        screen.queryByRole("button", { name: /Check Host and Port settings/ }),
      ).not.toBeInTheDocument();
    });

    it("should render the 'More troubleshooting tips' button", () => {
      setup(setupOptions);
      expect(
        screen.getByRole("button", { name: /More troubleshooting tips/ }),
      ).toBeInTheDocument();
    });
  });

  describe("Host and port error", () => {
    const setupOptions: SetupOptions = {
      errorMessage: "Random error message",
      errorVariant: "hostAndPort",
    };

    it("should render the error alert with specific message", () => {
      setup(setupOptions);
      expect(
        within(screen.getByRole("alert")).getByText(
          "Hmm, we couldn't connect to the database",
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("alert")).getByText(
          "Make sure your Host and Port settings are correct.",
        ),
      ).toBeInTheDocument();
    });

    it("should render the 'Check Host and Port settings' button", () => {
      setup(setupOptions);
      expect(
        screen.getByRole("button", { name: /Check Host and Port settings/ }),
      ).toBeInTheDocument();
    });

    it("should render the 'More troubleshooting tips' button", () => {
      setup(setupOptions);
      expect(
        screen.getByRole("button", { name: /More troubleshooting tips/ }),
      ).toBeInTheDocument();
    });
  });
});
