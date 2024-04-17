import { renderWithProviders, screen } from "__support__/ui";
import { useInitData } from "embedding-sdk/hooks";
import type { SDKConfigType } from "embedding-sdk/types";

const TestComponent = ({
  authType,
}: {
  authType: SDKConfigType["authType"];
}) => {
  const config =
    authType === "jwt"
      ? { authType, jwtProviderUri: "TEST_URI" }
      : { authType, apiKey: "TEST_API_KEY" };

  const { isInitialized, isLoggedIn, loginStatus } = useInitData({
    config: {
      ...config,
      metabaseInstanceUrl: "http://localhost",
    },
  });

  console.log(loginStatus);

  return (
    <div
      data-testid="test-component"
      data-is-initialized={isInitialized}
      data-is-logged-in={isLoggedIn}
    >
      Test Component
    </div>
  );
};

// valid API key mb_3PjoPgLdWUOC6mu26BS5ksDYeJJRYQM/NTKvYqHFxl0=

// import registerVisualizations from "metabase/visualizations/register";
// ensure registerVisualizations is only called once
jest.mock("metabase/visualizations/register", () => jest.fn(() => {}));

const setup = ({ authType }: { authType: SDKConfigType["authType"] }) => {
  renderWithProviders(<TestComponent authType={authType} />);
};

describe("useInitData hook", () => {
  it("should initialize with isLoggedIn as false and isInitialized as false", () => {
    setup({ authType: "jwt" });
    expect(screen.getByText("Test Component")).toBeInTheDocument();
    expect(screen.getByTestId("test-component")).toHaveAttribute(
      "data-is-initialized",
      "false",
    );
    expect(screen.getByTestId("test-component")).toHaveAttribute(
      "data-is-logged-in",
      "false",
    );
  });

  describe("apiKey authentication", () => {
    it("should set isInitialized once the API key is set", () => {});
  });

  it("should set isInitialized to true after initialization", () => {});

  it("should set isLoggedIn to true after initialization if authType is jwt", () => {});

  it("should not set isLoggedIn to true after initialization if authType is not jwt", () => {});

  it("should fetch session token when authType is jwt", () => {});

  it("should set isLoggedIn to false if authType is not jwt or apiKey", () => {});

  it("should set isLoggedIn to true after fetching session token", () => {});

  it("should call refreshCurrentUser and reloadSettings after initialization", () => {});

  it("should set isLoggedIn to true after refreshing current user and reloading settings", () => {});
});
