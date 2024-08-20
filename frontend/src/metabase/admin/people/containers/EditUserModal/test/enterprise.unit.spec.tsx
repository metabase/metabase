import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setup, defaultUser } from "./setup";

describe("EditUserModal - enterprise", () => {
  it("can add a user attribute", async () => {
    setup({ userData: defaultUser, hasEnterprisePlugins: true });

    const submitButton = await screen.findByText("Update");
    const addAttributeButton = await screen.findByText("Add an attribute");

    await userEvent.click(addAttributeButton);

    await userEvent.type(
      await screen.findByPlaceholderText("Key"),
      "favorite_pokemon",
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Value"),
      "Pikachu",
    );

    await userEvent.click(submitButton);

    const call = fetchMock.lastCall("path:/api/user/97", { method: "PUT" });
    const req = await call?.request?.json();

    expect(req).toEqual({
      first_name: "Ash",
      last_name: "Ketchum",
      email: "pikachuboy97@example.com",
      user_group_memberships: [],
      login_attributes: {
        favorite_pokemon: "Pikachu",
      },
    });
  });

  it("can add a user attribute to a user with no name (metabase#40750)", async () => {
    setup({
      userData: {
        ...defaultUser,
        first_name: null,
        last_name: null,
      },
      hasEnterprisePlugins: true,
    });

    const submitButton = await screen.findByText("Update");
    const addAttributeButton = await screen.findByText("Add an attribute");

    await userEvent.click(addAttributeButton);

    await userEvent.type(
      await screen.findByPlaceholderText("Key"),
      "favorite_pokemon",
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Value"),
      "Pikachu",
    );

    await userEvent.click(submitButton);

    const call = fetchMock.lastCall("path:/api/user/97", { method: "PUT" });
    const req = await call?.request?.json();

    expect(req).toEqual({
      first_name: null,
      last_name: null,
      email: "pikachuboy97@example.com",
      user_group_memberships: [],
      login_attributes: {
        favorite_pokemon: "Pikachu",
      },
    });
  });
});
