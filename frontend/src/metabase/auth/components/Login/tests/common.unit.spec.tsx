import "metabase/auth/plugins";
import { screen } from "__support__/ui";

import { setup } from "./setup";

const GOOGLE_CLIENT_ID = "example.apps.googleusercontent.com";

// the real button is drawn by a script from Google, which jsdom does not load
jest.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({
    clientId,
    children,
  }: {
    clientId: string;
    children: React.ReactNode;
  }) => <section aria-label={`Google client ${clientId}`}>{children}</section>,
  GoogleLogin: () => <button>Sign in with Google</button>,
}));

describe("Login", () => {
  it("should render a list of auth providers", () => {
    setup({ isPasswordLoginEnabled: true, isGoogleAuthEnabled: true });

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("should render the panel of the selected provider", () => {
    setup({
      initialRoute: "/auth/login/password",
      isPasswordLoginEnabled: true,
      isGoogleAuthEnabled: true,
    });

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should implicitly select the only provider with a panel", () => {
    setup({
      isPasswordLoginEnabled: true,
      isGoogleAuthEnabled: false,
    });

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should not disable password login for OSS", () => {
    setup({ isPasswordLoginEnabled: false, isGoogleAuthEnabled: true });

    expect(screen.getByText("Sign in with email")).toBeInTheDocument();
  });

  it("shows the Google sign-in button next to the email link while Google sign-in is enabled", () => {
    setup({
      isPasswordLoginEnabled: true,
      isGoogleAuthEnabled: true,
      googleAuthClientId: GOOGLE_CLIENT_ID,
    });

    expect(
      screen.getByRole("region", { name: `Google client ${GOOGLE_CLIENT_ID}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Remember me" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in with email" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("shows only the email and password form while Google sign-in is disabled", () => {
    setup({
      isPasswordLoginEnabled: true,
      isGoogleAuthEnabled: false,
      googleAuthClientId: GOOGLE_CLIENT_ID,
    });

    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Google/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign in with email" }),
    ).not.toBeInTheDocument();
  });
});
