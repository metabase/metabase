import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useSelector } from "metabase/lib/redux";

import {
  IsAuthenticatedGuard,
  UserIsNotAuthenticatedGuard,
} from "./RouteGuards";

jest.mock("metabase/lib/redux", () => ({
  useSelector: jest.fn(),
}));

const useSelectorMock = jest.mocked(useSelector);

describe("RouteGuards", () => {
  beforeEach(() => {
    useSelectorMock.mockImplementation((selector: any) =>
      selector({
        settings: { values: { "has-user-setup": true } },
        currentUser: null,
        auth: { loginPending: false, redirect: true },
      }),
    );
  });

  it("redirects unauthenticated users to login", () => {
    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <IsAuthenticatedGuard>
                <div>Protected content</div>
              </IsAuthenticatedGuard>
            }
          />
          <Route path="/auth/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("redirects authenticated users away from auth pages", () => {
    useSelectorMock.mockImplementation((selector: any) =>
      selector({
        settings: { values: { "has-user-setup": true } },
        currentUser: { id: 1, is_superuser: false },
        auth: { loginPending: false, redirect: true },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth/login?redirect=/dashboard/123"]}>
        <Routes>
          <Route
            path="/auth/login"
            element={
              <UserIsNotAuthenticatedGuard>
                <div>Login form</div>
              </UserIsNotAuthenticatedGuard>
            }
          />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Home page")).toBeInTheDocument();
  });
});
