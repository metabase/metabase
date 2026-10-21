import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateUserEndpoint,
  setupGroupsEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route } from "metabase/router";
import { createMockGroup, createMockUser } from "metabase-types/api/mocks";

import { NewUserModal } from "./NewUserModal";
import { UserSuccessModal } from "./UserSuccessModal";

const NEW_USER = createMockUser({
  id: 42,
  first_name: "Testy",
  last_name: "McTestface",
  common_name: "Testy McTestface",
  email: "testy@metabase.test",
});

interface SetupOpts {
  passwordLoginEnabled: boolean;
}

const setup = ({ passwordLoginEnabled }: SetupOpts) => {
  setupGroupsEndpoint([createMockGroup()]);
  setupCreateUserEndpoint(NEW_USER);
  setupUserEndpoints(NEW_USER);

  const { router } = renderWithProviders(
    <>
      <Route path="/admin/people">
        {modalRoute("new", NewUserModal, { noWrap: true })}
      </Route>
      <Route path="/admin/people/:userId">
        {modalRoute("success", UserSuccessModal, { noWrap: true })}
      </Route>
    </>,
    {
      withRouter: true,
      initialRoute: "/admin/people/new",
      storeInitialState: createMockState({
        settings: mockSettings({
          "email-configured?": true,
          "google-auth-enabled": true,
          "enable-password-login": passwordLoginEnabled,
        }),
      }),
    },
  );

  return { pathname: () => router?.location.pathname };
};

const inviteUser = async () => {
  await userEvent.type(screen.getByLabelText("First name"), "Testy");
  await userEvent.type(screen.getByLabelText("Last name"), "McTestface");
  await userEvent.type(screen.getByLabelText(/Email/), NEW_USER.email);
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
};

const getCreateUserBody = async (): Promise<unknown> => {
  const call = fetchMock.callHistory.lastCall("path:/api/user", {
    method: "POST",
  });
  return call?.request?.json();
};

describe("NewUserModal with email and SSO configured", () => {
  it("should invite the user to set their password when password login is enabled", async () => {
    const { pathname } = setup({ passwordLoginEnabled: true });

    await inviteUser();

    const modal = await screen.findByRole("dialog", {
      name: "Testy McTestface has been added",
    });
    expect(pathname()).toBe("/admin/people/42/success");
    expect(modal).toHaveTextContent(
      "We’ve sent an invite to testy@metabase.test with instructions to set their password.",
    );
    expect(
      within(modal).queryByRole("link", { name: "reset their password." }),
    ).not.toBeInTheDocument();
    expect(await getCreateUserBody()).not.toHaveProperty("password");
  });

  it("should invite the user to log in with a reset password link when password login is disabled (metabase#23630)", async () => {
    const { pathname } = setup({ passwordLoginEnabled: false });

    await inviteUser();

    const modal = await screen.findByRole("dialog", {
      name: "Testy McTestface has been added",
    });
    expect(pathname()).toBe("/admin/people/42/success");
    expect(modal).toHaveTextContent(
      "We’ve sent an invite to testy@metabase.test with instructions to log in. If this user is unable to authenticate then you can reset their password.",
    );
    expect(
      within(modal).getByRole("link", { name: "reset their password." }),
    ).toHaveAttribute("href", "/admin/people/42/reset");
    expect(await getCreateUserBody()).not.toHaveProperty("password");
  });
});
