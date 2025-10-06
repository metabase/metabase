import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { GettingStartedSection } from "./GettingStartedSection";

const setup = ({
  hasChildren = true,
  isAdmin = true,
}: {
  hasChildren?: boolean;
  isAdmin?: boolean;
} = {}) => {
  const onAddDataModalOpen = jest.fn();

  renderWithProviders(
    <GettingStartedSection
      nonEntityItem={{ type: "collection" }}
      onAddDataModalOpen={onAddDataModalOpen}
    >
      {hasChildren && "Child"}
    </GettingStartedSection>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  return { onAddDataModalOpen };
};

describe("GettingStartedSection", () => {
  it("should render the section title", () => {
    setup();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
  });

  it("should render children if it has them", () => {
    setup();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("should not render children if there are none", () => {
    setup({ hasChildren: false });
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("should render the onboarding link", () => {
    setup();
    expect(screen.getByText("How to use Metabase")).toBeInTheDocument();
  });

  it("should render the 'Add data' button", () => {
    setup();
    expect(screen.getByLabelText("Add data")).toBeInTheDocument();
  });

  it("should not render the 'Add data' button if the user is not an admin", () => {
    setup({ isAdmin: false });
    expect(screen.queryByLabelText("Add data")).not.toBeInTheDocument();
  });

  it("should trigger the modal on 'Add data' click", async () => {
    const { onAddDataModalOpen } = setup();
    await userEvent.click(screen.getByText("Add data"));
    expect(onAddDataModalOpen).toHaveBeenCalledTimes(1);
  });
});
