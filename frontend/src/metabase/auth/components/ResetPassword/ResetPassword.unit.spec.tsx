import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCurrentUserEndpoint,
  setupPasswordCheckEndpoint,
  setupPasswordResetTokenEndpoint,
  setupPropertiesEndpoints,
  setupResetPasswordEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

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

  return renderWithProviders(
    <>
      <Route path="/" component={TestHome} />
      <Route path="/another-page" component={AnotherPage} />
      <Route path="/auth/reset_password/:token" component={ResetPassword} />
    </>,
    {
      withRouter: true,
      initialRoute: "/auth/reset_password/token",
    },
  );
};

const TestHome = () => <div>Home</div>;
const AnotherPage = () => <div>Another page</div>;

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

  describe("when form is submitted", () => {
    const fillAndSubmit = async () => {
      expect(await screen.findByText("New password")).toBeInTheDocument();

      await userEvent.type(
        screen.getByLabelText("Create a password"),
        "#Password#1!",
      );
      await userEvent.type(
        screen.getByLabelText("Confirm your password"),
        "#Password#1!",
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Save new password" }),
        ).toBeEnabled();
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Save new password" }),
      );
    };

    it("should redirect to home page by default", async () => {
      setup({ isTokenValid: true });
      await fillAndSubmit();
      expect(await screen.findByText("Home")).toBeInTheDocument();
    });

    it("should allow a custom redirect to be specified", async () => {
      const { history } = setup({ isTokenValid: true });

      act(() => {
        history?.replace(`/auth/reset_password/token?redirect=/another-page`);
      });

      await fillAndSubmit();
      expect(await screen.findByText("Another page")).toBeInTheDocument();
    });
  });
});
