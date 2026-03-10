import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRemoteSyncBranchesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Combobox, useCombobox } from "metabase/ui";

import { BranchDropdown } from "./BranchDropdown";

function WrapperComponent({
  value,
  onChange,
  baseBranch = "main",
  allowCreate = true,
}: {
  value: string;
  onChange: (branch: string, isNewBranch?: boolean) => void;
  baseBranch?: string;
  allowCreate?: boolean;
}) {
  const combobox = useCombobox({ opened: true });

  return (
    <Combobox store={combobox} withinPortal={false}>
      <BranchDropdown
        value={value}
        onChange={onChange}
        baseBranch={baseBranch}
        allowCreate={allowCreate}
        combobox={combobox}
      />
    </Combobox>
  );
}

const setupEndpoints = () => {
  setupRemoteSyncBranchesEndpoint(["main", "develop", "feature-1"]);
  fetchMock.post("path:/api/ee/remote-sync/create-branch", {});
};

const setup = (
  props: Partial<{
    value: string;
    baseBranch: string;
    allowCreate: boolean;
  }> = {},
) => {
  const onChange = jest.fn();
  const mergedProps = {
    value: "main",
    baseBranch: "main",
    allowCreate: true,
    ...props,
  };

  setupEndpoints();

  renderWithProviders(
    <WrapperComponent {...mergedProps} onChange={onChange} />,
  );

  return { onChange };
};

describe("BranchDropdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render search input", async () => {
      setup();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });
    });

    it("should show available branches in dropdown", async () => {
      setup({ value: "main" });

      await waitFor(() => {
        expect(screen.getByTestId("branch-item-develop")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("branch-item-main")).not.toBeInTheDocument();
      expect(screen.getByTestId("branch-item-feature-1")).toBeInTheDocument();
    });
  });

  describe("search filtering", () => {
    it("should filter branches based on search input", async () => {
      setup({ value: "main" });

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

    it("should show create option when search has no results and allowCreate is true", async () => {
      setup({ value: "main", allowCreate: true });

      await waitFor(() => {
        expect(screen.getByTestId("branch-item-develop")).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "nonexistent",
      );

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-button")).toBeInTheDocument();
      });
    });

    it("should show no branches message when search has no results and allowCreate is false", async () => {
      setup({ value: "main", allowCreate: false });

      await waitFor(() => {
        expect(screen.getByTestId("branch-item-develop")).toBeInTheDocument();
      });

      await userEvent.type(
        screen.getByPlaceholderText("Find or create a branch..."),
        "nonexistent",
      );

      await waitFor(() => {
        expect(screen.getByText("No branches found")).toBeInTheDocument();
      });
    });
  });

  describe("branch selection", () => {
    it("should call onChange with branch name when branch is selected", async () => {
      const { onChange } = setup({ value: "main" });

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
