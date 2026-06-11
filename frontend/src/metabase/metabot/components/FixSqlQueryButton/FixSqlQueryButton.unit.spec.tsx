import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { METABOT_ERR_MSG } from "metabase/metabot/constants";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { setIsNativeEditorOpen } from "metabase/redux/query-builder";

import { trackQueryFixClicked } from "../../analytics";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

const mockSubmitInput = jest.fn();
const mockSetIsNativeEditorOpen = jest.fn();

jest.mock("../../analytics", () => ({
  trackQueryFixClicked: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
}));

jest.mock("metabase/redux/query-builder", () => ({
  ...jest.requireActual("metabase/redux/query-builder"),
  setIsNativeEditorOpen: jest.fn(),
}));

function setup(options?: {
  canUseSqlGeneration?: boolean;
  hasSqlGenerationAccess?: boolean;
  isDoingScience?: boolean;
}) {
  const {
    canUseSqlGeneration = true,
    hasSqlGenerationAccess = true,
    isDoingScience = false,
  } = options ?? {};

  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    isLoading: false,
    isError: false,
    isConfigured: canUseSqlGeneration,
    canConfigure: true,
    hasMetabotAccess: hasSqlGenerationAccess,
    canUseMetabot: canUseSqlGeneration,
    hasSqlGenerationAccess,
    canUseSqlGeneration,
    hasNlqAccess: hasSqlGenerationAccess,
    canUseNlq: canUseSqlGeneration,
    hasOtherToolsAccess: hasSqlGenerationAccess,
    canUseOtherTools: canUseSqlGeneration,
  });
  jest.mocked(useMetabotAgent).mockReturnValue({
    submitInput: mockSubmitInput,
    isDoingScience,
  } as any);
  jest
    .mocked(setIsNativeEditorOpen)
    .mockImplementation(mockSetIsNativeEditorOpen as any);

  return renderWithProviders(<FixSqlQueryButton />, { withUndos: true });
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitInput.mockResolvedValue(undefined);
    mockSetIsNativeEditorOpen.mockReturnValue({
      type: "metabase/qb/SET_IS_NATIVE_EDITOR_OPEN",
      isNativeEditorOpen: true,
    });
  });

  it("should render the button with correct text when metabot is enabled", () => {
    setup({ canUseSqlGeneration: true });
    expect(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
    expect(useMetabotAgent).toHaveBeenCalledWith("sql");
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ canUseSqlGeneration: false, hasSqlGenerationAccess: false });
    expect(
      screen.queryByRole("button", { name: /Have Metabot fix it/ }),
    ).not.toBeInTheDocument();
  });

  it("is visible when SQL generation access exists but Metabot is not configured", () => {
    setup({ canUseSqlGeneration: false, hasSqlGenerationAccess: true });

    expect(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
  });

  it("shows the not-configured toast instead of starting SQL fixing when Metabot is not configured", async () => {
    setup({ canUseSqlGeneration: false, hasSqlGenerationAccess: true });

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(await screen.findByTestId("toast-undo")).toBeInTheDocument();
    expect(await screen.findByText(/connect to a model/)).toBeInTheDocument();
    expect(trackQueryFixClicked).not.toHaveBeenCalled();
    expect(mockSetIsNativeEditorOpen).not.toHaveBeenCalled();
    expect(mockSubmitInput).not.toHaveBeenCalled();
  });

  it("should submit an SQL fix prompt when clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(trackQueryFixClicked).toHaveBeenCalled();
    expect(mockSetIsNativeEditorOpen).toHaveBeenCalledWith(true);
    expect(mockSubmitInput).toHaveBeenCalledWith("Fix this SQL query", {
      preventOpenSidebar: true,
    });
  });

  it("should show a loading state while the SQL agent is processing", () => {
    setup({ isDoingScience: true });

    expect(
      screen.getByRole("button", {
        name: /Have Metabot fix it/,
      }),
    ).toBeDisabled();
  });

  it("shows the managed-provider lockout toast when SQL fixing is locked", async () => {
    mockSubmitInput.mockResolvedValue({
      meta: { requestStatus: "fulfilled", requestId: "1" },
      payload: {
        success: false,
        error: {
          type: "locked",
          message: "unused",
        },
      },
    });

    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(
      await screen.findByText("You've run out of AI service tokens"),
    ).toBeInTheDocument();
  });

  it("shows the error when fixing SQL fails", async () => {
    mockSubmitInput.mockResolvedValue({
      meta: { requestStatus: "fulfilled", requestId: "1" },
      payload: {
        success: false,
        error: {
          type: "message",
          message: "Something went wrong",
        },
      },
    });

    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("falls back to the default Metabot error message when none is returned", async () => {
    mockSubmitInput.mockResolvedValue({
      meta: { requestStatus: "fulfilled", requestId: "1" },
      payload: {
        success: false,
      },
    });

    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(
      await screen.findByText(METABOT_ERR_MSG.default),
    ).toBeInTheDocument();
  });
});
