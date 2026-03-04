import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  SqlFixerInlinePromptProvider,
  useRegisterSqlFixerInlineContextProvider,
} from "metabase/query_builder/components/view/View/ViewMainContainer/SqlFixerInlinePromptContext";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { trackQueryFixClicked } from "../../analytics";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

const mockRequestSqlFixPrompt = jest.fn();

jest.mock("../../analytics", () => ({
  trackQueryFixClicked: jest.fn(),
}));

function SqlFixerInlinePromptRegistration({
  requestSqlFixPrompt,
}: {
  requestSqlFixPrompt: (prompt: string) => Promise<void>;
}) {
  useRegisterSqlFixerInlineContextProvider(requestSqlFixPrompt, [
    requestSqlFixPrompt,
  ]);

  return null;
}

function setup(options?: {
  withRegisteredPrompt?: boolean;
  requestSqlFixPrompt?: (prompt: string) => Promise<void>;
  isMetabotEnabled?: boolean;
}) {
  const {
    isMetabotEnabled = true,
    withRegisteredPrompt = true,
    requestSqlFixPrompt,
  } = options ?? {};
  const settings = mockSettings({
    "metabot-enabled?": isMetabotEnabled,
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  renderWithProviders(
    <SqlFixerInlinePromptProvider>
      {withRegisteredPrompt && (
        <SqlFixerInlinePromptRegistration
          requestSqlFixPrompt={
            requestSqlFixPrompt ??
            (async (prompt) => mockRequestSqlFixPrompt(prompt))
          }
        />
      )}
      <FixSqlQueryButton />
    </SqlFixerInlinePromptProvider>,
    {
      storeInitialState: createMockState({ settings }),
    },
  );
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the button with correct text when metabot is enabled", async () => {
    setup({ isMetabotEnabled: true });
    expect(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Have Metabot fix it/ }),
    ).not.toBeInTheDocument();
  });

  it("should not render when inline sql prompt is unavailable", async () => {
    setup({ withRegisteredPrompt: false });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Have Metabot fix it/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("should request an SQL fix prompt when clicked", async () => {
    const requestSqlFixPrompt = jest.fn(async (prompt: string) => {
      mockRequestSqlFixPrompt(prompt);
    });

    setup({ requestSqlFixPrompt });

    await userEvent.click(
      await screen.findByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(trackQueryFixClicked).toHaveBeenCalled();
    expect(requestSqlFixPrompt).toHaveBeenCalledWith("Fix this SQL query");
    expect(mockRequestSqlFixPrompt).toHaveBeenCalledWith("Fix this SQL query");
  });

  it("should hide loading state when generation is cancelled", async () => {
    let requestPromiseResolve:
      | ((value: void | PromiseLike<void>) => void)
      | undefined;

    setup({
      requestSqlFixPrompt: () =>
        new Promise<void>((resolve) => {
          requestPromiseResolve = resolve;
        }),
    });

    const button = await screen.findByRole("button", {
      name: /Have Metabot fix it/,
    });

    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    expect(requestPromiseResolve).toBeDefined();
    requestPromiseResolve?.(undefined);

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });
});
