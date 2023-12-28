import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import {
  setupCurrentUserEndpoint,
  setupPasswordCheckEndpoint,
  setupPasswordResetTokenEndpoint,
  setupPropertiesEndpoints,
  setupResetPasswordEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ResetPassword } from "./ResetPassword";

interface SetupOpts {
  isTokenValid?: boolean;
}

const setup = ({ isTokenValid = true }: SetupOpts = {}) => {
  setupPasswordResetTokenEndpoint({ valid: isTokenValid });
  setupResetPasswordEndpoint();
  setupPasswordCheckEndpoint();
  setupCurrentUserEndpoint(createMockUser());
  setupPropertiesEndpoints(createMockSettings());

  renderWithProviders(
    <>
      <Route path="/" component={TestHome} />
      <Route path="/auth/reset_password/:token" component={ResetPassword} />
    </>,
    {
      withRouter: true,
      initialRoute: "/auth/reset_password/token",
    },
  );
};

const TestHome = () => <div>Home</div>;

describe("ResetPassword", () => {
  it("should show a form when token validations succeeds", async () => {
    setup({ isTokenValid: true });
    expect(await screen.findByText("New password")).toBeInTheDocument();
  });

  it("should show an error message when token validation fails", async () => {
    setup({ isTokenValid: false });
    expect(
      await screen.findByText(/that's an expired link/),
    ).toBeInTheDocument();
  });

  it("should show a success message when the form is submitted", async () => {
    setup({ isTokenValid: true });
    expect(await screen.findByText("New password")).toBeInTheDocument();

    userEvent.type(screen.getByLabelText("Create a password"), "test");
    userEvent.type(screen.getByLabelText("Confirm your password"), "test");
    await waitFor(() => {
      expect(screen.getByText("Save new password")).toBeEnabled();
    });

    userEvent.click(screen.getByText("Save new password"));
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });
});
