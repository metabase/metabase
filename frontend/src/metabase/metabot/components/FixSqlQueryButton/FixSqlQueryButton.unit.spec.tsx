import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch } from "metabase/lib/redux";
import { METABOT_ERR_MSG } from "metabase/metabot/constants";
import {
  useMetabotAgent,
  useMetabotEnabledEmbeddingAware,
} from "metabase/metabot/hooks";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";

import { trackQueryFixClicked } from "../../analytics";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

const mockSubmitInput = jest.fn();
const mockDispatch = jest.fn();
const mockSendToast = jest.fn();
const mockSetIsNativeEditorOpen = jest.fn();

jest.mock("../../analytics", () => ({
  trackQueryFixClicked: jest.fn(),
}));

jest.mock("metabase/lib/redux", () => ({
  ...jest.requireActual("metabase/lib/redux"),
  useDispatch: jest.fn(),
}));

jest.mock("metabase/common/hooks/use-toast", () => ({
  ...jest.requireActual("metabase/common/hooks/use-toast"),
  useToast: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useMetabotEnabledEmbeddingAware: jest.fn(),
}));

jest.mock("metabase/query_builder/actions", () => ({
  ...jest.requireActual("metabase/query_builder/actions"),
  setIsNativeEditorOpen: jest.fn(),
}));

function setup(options?: {
  isMetabotEnabled?: boolean;
  isDoingScience?: boolean;
}) {
  const { isMetabotEnabled = true, isDoingScience = false } = options ?? {};

  jest
    .mocked(useMetabotEnabledEmbeddingAware)
    .mockReturnValue(isMetabotEnabled);
  jest.mocked(useMetabotAgent).mockReturnValue({
    submitInput: mockSubmitInput,
    isDoingScience,
  } as any);
  jest.mocked(useToast).mockReturnValue([mockSendToast, jest.fn()]);
  jest.mocked(useDispatch).mockReturnValue(mockDispatch as any);
  jest
    .mocked(setIsNativeEditorOpen)
    .mockImplementation(mockSetIsNativeEditorOpen as any);

  return renderWithProviders(<FixSqlQueryButton />);
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitInput.mockResolvedValue(undefined);
    mockDispatch.mockImplementation((action) => action);
    mockSetIsNativeEditorOpen.mockReturnValue({
      type: "metabase/qb/SET_IS_NATIVE_EDITOR_OPEN",
      isNativeEditorOpen: true,
    });
  });

  it("should render the button with correct text when metabot is enabled", () => {
    setup({ isMetabotEnabled: true });
    expect(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    ).toBeInTheDocument();
    expect(useMetabotAgent).toHaveBeenCalledWith("sql");
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: /Have Metabot fix it/ }),
    ).not.toBeInTheDocument();
  });

  it("should submit an SQL fix prompt when clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(trackQueryFixClicked).toHaveBeenCalled();
    expect(mockSetIsNativeEditorOpen).toHaveBeenCalledWith(true);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: "metabase/qb/SET_IS_NATIVE_EDITOR_OPEN",
      isNativeEditorOpen: true,
    });
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
        errorMessage: {
          type: "locked",
          message: "unused",
        },
      },
    });

    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(mockSendToast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "metabot-managed-provider-limit",
        icon: null,
        timeout: 0,
        toastColor: "error",
      }),
    );
  });

  it("shows the error when fixing SQL fails", async () => {
    mockSubmitInput.mockResolvedValue({
      meta: { requestStatus: "fulfilled", requestId: "1" },
      payload: {
        success: false,
        errorMessage: {
          type: "alert",
          message: "Something went wrong",
        },
      },
    });

    setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Have Metabot fix it/ }),
    );

    expect(mockSendToast).toHaveBeenCalledWith({
      icon: "warning",
      toastColor: "error",
      message: "Something went wrong",
    });
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

    expect(mockSendToast).toHaveBeenCalledWith({
      icon: "warning",
      toastColor: "error",
      message: METABOT_ERR_MSG.default,
    });
  });
});
