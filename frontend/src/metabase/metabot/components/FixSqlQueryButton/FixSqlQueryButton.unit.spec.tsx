import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";
import { useDispatch } from "metabase/utils/redux";

import { trackQueryFixClicked } from "../../analytics";

import { FixSqlQueryButton } from "./FixSqlQueryButton";

const mockSubmitInput = jest.fn();
const mockDispatch = jest.fn();
const mockSetIsNativeEditorOpen = jest.fn();

jest.mock("../../analytics", () => ({
  trackQueryFixClicked: jest.fn(),
}));

jest.mock("metabase/utils/redux", () => ({
  ...jest.requireActual("metabase/utils/redux"),
  useDispatch: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
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

  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    isLoading: false,
    isError: false,
    canUseMetabot: isMetabotEnabled,
    canUseSqlGeneration: isMetabotEnabled,
    canUseNlq: isMetabotEnabled,
    canUseOtherTools: isMetabotEnabled,
  });
  jest.mocked(useMetabotAgent).mockReturnValue({
    submitInput: mockSubmitInput,
    isDoingScience,
  } as any);
  jest.mocked(useDispatch).mockReturnValue(mockDispatch as any);
  jest
    .mocked(setIsNativeEditorOpen)
    .mockImplementation(mockSetIsNativeEditorOpen as any);

  renderWithProviders(<FixSqlQueryButton />);
}

describe("FixSqlQueryButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitInput.mockResolvedValue(undefined);
    mockDispatch.mockResolvedValue(undefined);
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
    expect(mockSubmitInput).toHaveBeenCalledWith("Fix this SQL query");
  });

  it("should show a loading state while the SQL agent is processing", () => {
    setup({ isDoingScience: true });

    expect(
      screen.getByRole("button", {
        name: /Have Metabot fix it/,
      }),
    ).toBeDisabled();
  });
});
