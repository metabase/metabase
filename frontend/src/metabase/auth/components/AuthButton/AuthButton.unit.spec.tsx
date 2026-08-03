import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import {
  AuthCardButton,
  AuthCardLink,
  AuthTextButton,
  AuthTextLink,
} from "./AuthButton";

describe("AuthTextButton", () => {
  it("should render a button", () => {
    renderWithProviders(<AuthTextButton>Sign in</AuthTextButton>);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("AuthCardButton", () => {
  it("should render a card button", () => {
    renderWithProviders(<AuthCardButton>Sign in</AuthCardButton>);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("AuthTextLink", () => {
  it("should render a link", () => {
    renderWithProviders(
      <Route
        path="/"
        element={<AuthTextLink to="/auth/login">Sign in</AuthTextLink>}
      />,
      { withRouter: true },
    );

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("AuthCardLink", () => {
  it("should render a card link", () => {
    renderWithProviders(
      <Route
        path="/"
        element={<AuthCardLink to="/auth/login">Sign in</AuthCardLink>}
      />,
      { withRouter: true },
    );

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});
