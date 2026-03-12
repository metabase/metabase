import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UpsellWrapper } from "./UpsellWrapper";

const Component = () => <div>Hello, beautiful</div>;

describe("Upsells > UpsellWrapper", () => {
  it("should show a component for admins", () => {
    const WrappedComponent = UpsellWrapper(Component);

    renderWithProviders(<WrappedComponent />, {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    });

    expect(screen.getByText("Hello, beautiful")).toBeInTheDocument();
  });

  it("should not show component for non-=admins", () => {
    const WrappedComponent = UpsellWrapper(Component);

    renderWithProviders(<WrappedComponent />, {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: false }),
      },
    });

    expect(screen.queryByText("Hello, beautiful")).not.toBeInTheDocument();
  });
});
