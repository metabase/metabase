import { renderWithProviders, screen } from "__support__/ui";
import { AppInitializeController } from "./AppInitializeController";

const setup = ({ isLoggedIn = true, isInitialized = true }) => {
  jest.mock("embedding-sdk/hooks/private/use-init-data.ts", () => ({
    useInitData: jest.fn(() => ({ isLoggedIn, isInitialized })),
  }));

  return renderWithProviders(
    <AppInitializeController config={{}}>
      <div>Child Component</div>
    </AppInitializeController>,
  );
};

describe("AppInitializeController", () => {
  it("renders loading message while initialization is in progress", () => {
    setup();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Child Component")).not.toBeInTheDocument();
  });

  it("renders children when initialization is complete", async () => {
    setup();
    expect(await screen.findByText("Child Component")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("renders an error message when user is unauthenticated", () => {});
});
