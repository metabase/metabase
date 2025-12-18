import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { BranchPicker } from "./BranchPicker";

const defaultProps = {
  value: "main",
  onChange: jest.fn(),
  disabled: false,
  isLoading: false,
  baseBranch: "main",
  allowCreate: true,
};

const setupEndpoints = () => {
  fetchMock.get("path:/api/ee/remote-sync/branches", {
    items: ["main", "develop", "feature-1"],
  });
  fetchMock.post("path:/api/ee/remote-sync/create-branch", {});
};

const setup = (props: Partial<typeof defaultProps> = {}) => {
  const onChange = jest.fn();
  const mergedProps = { ...defaultProps, onChange, ...props };

  setupEndpoints();

  renderWithProviders(<BranchPicker {...mergedProps} />);

  return { onChange };
};

describe("BranchPicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render button with current branch name", () => {
      setup({ value: "main" });

      expect(screen.getByTestId("branch-picker-button")).toBeInTheDocument();
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    it("should render with different branch name", () => {
      setup({ value: "feature-branch" });

      expect(screen.getByText("feature-branch")).toBeInTheDocument();
    });
  });

  describe("disabled state", () => {
    it("should disable button when disabled prop is true", () => {
      setup({ disabled: true });

      expect(screen.getByTestId("branch-picker-button")).toBeDisabled();
    });

    it("should disable button when isLoading is true", () => {
      setup({ isLoading: true });

      expect(screen.getByTestId("branch-picker-button")).toBeDisabled();
    });
  });

  describe("dropdown behavior", () => {
    it("should open dropdown when button is clicked", async () => {
      setup();

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });
    });

    it("should show available branches in dropdown", async () => {
      setup({ value: "main" });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        // Other branches should be visible
        expect(screen.getByTestId("branch-item-develop")).toBeInTheDocument();
      });
      // Current branch (main) should not be in the list
      expect(screen.queryByTestId("branch-item-main")).not.toBeInTheDocument();
      expect(screen.getByTestId("branch-item-feature-1")).toBeInTheDocument();
    });

    it("should filter branches based on search input", async () => {
      setup({ value: "main" });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(screen.getByTestId("branch-item-develop")).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "feat",
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-item-feature-1")).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId("branch-item-develop"),
      ).not.toBeInTheDocument();
    });
  });

  describe("branch selection", () => {
    it("should call onChange with branch name when branch is selected", async () => {
      const { onChange } = setup({ value: "main" });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(screen.getByTestId("branch-item-develop")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("branch-item-develop"));

      expect(onChange).toHaveBeenCalledWith("develop", false);
    });
  });

  describe("branch creation", () => {
    it("should show create option when search does not match existing branches", async () => {
      setup({ value: "main" });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "new-branch",
      );

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-button")).toBeInTheDocument();
      });
      expect(
        screen.getByText('Create branch "new-branch"'),
      ).toBeInTheDocument();
    });

    it("should not show create option when allowCreate is false", async () => {
      setup({ value: "main", allowCreate: false });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "new-branch",
      );

      await waitFor(() => {
        expect(
          screen.queryByTestId("create-branch-button"),
        ).not.toBeInTheDocument();
      });
    });

    it("should not show create option when search matches existing branch", async () => {
      setup({ value: "main" });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "develop",
      );

      await waitFor(() => {
        expect(
          screen.queryByTestId("create-branch-button"),
        ).not.toBeInTheDocument();
      });
    });

    it("should call createBranch mutation and onChange when create option is clicked", async () => {
      const { onChange } = setup({ value: "main" });

      await userEvent.click(screen.getByTestId("branch-picker-button"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "new-feature",
      );

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-button")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("create-branch-button"));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done("path:/api/ee/remote-sync/create-branch"),
        ).toBe(true);
      });

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith("new-feature", true);
      });
    });
  });
});
