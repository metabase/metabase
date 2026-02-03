import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { defaultUser, setup } from "./setup";

describe("Edit user modal", () => {
  it("should populate existing data", async () => {
    setup({ userData: defaultUser });
    expect(await screen.findByText("Edit user")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Ash")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Ketchum")).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue("pikachuboy97@example.com"),
    ).toBeInTheDocument();
  });

  it("should close the modal when the close button is clicked", async () => {
    const { onCloseSpy } = setup({ userData: defaultUser });
    await userEvent.click(await screen.findByText("Cancel"));
    expect(onCloseSpy).toHaveBeenCalled();
  });

  it("should send name updates to the API", async () => {
    setup({ userData: defaultUser });
    const firstNameField = await screen.findByLabelText("First name");

    await userEvent.clear(firstNameField);
    await userEvent.type(firstNameField, "Misty");

    const submitButton = await screen.findByRole("button", { name: /Update/ });
    expect(submitButton).toBeEnabled();

    await userEvent.click(submitButton);

    const puts = await findRequests("PUT");
    const userPut = puts.find((p) => p.url.includes("/api/user/97"));

    expect(userPut?.body).toEqual({
      first_name: "Misty",
      last_name: "Ketchum",
      email: "pikachuboy97@example.com",
      user_group_memberships: [],
      login_attributes: {},
    });
  });

  describe("users with empty name fields (metabase#46446)", () => {
    it("can update the first name of a user with no last name", async () => {
      setup({
        userData: {
          id: 11,
          first_name: "Prince",
          last_name: null,
          email: "name@example.com",
        },
      });

      const firstNameField = await screen.findByLabelText("First name");

      await userEvent.clear(firstNameField);
      await userEvent.type(firstNameField, "Madonna");

      const submitButton = await screen.findByRole("button", { name: /Update/ });
      await userEvent.click(submitButton);

      const puts = await findRequests("PUT");
      const userPut = puts.find((p) => p.url.includes("/api/user/11"));

      expect(userPut?.body).toEqual({
        first_name: "Madonna",
        last_name: null, // this null key must be present
        email: "name@example.com",
        user_group_memberships: [],
        login_attributes: {},
      });
    });

    it("can update the email of a user with no name", async () => {
      setup({
        userData: {
          id: 11,
          first_name: null,
          last_name: null,
          email: "neo@example.com",
        },
      });

      const emailField = await screen.findByLabelText("Email *");

      await userEvent.clear(emailField);
      await userEvent.type(emailField, "morpheus@example.com");

      const submitButton = await screen.findByRole("button", { name: /Update/ });
      await userEvent.click(submitButton);

      const puts = await findRequests("PUT");
      const userPut = puts.find((p) => p.url.includes("/api/user/11"));

      expect(userPut?.body).toEqual({
        first_name: null, // this null key must be present
        last_name: null, // this null key must be present
        email: "morpheus@example.com",
        user_group_memberships: [],
        login_attributes: {},
      });
    });

    it("can remove a user's name", async () => {
      setup({
        userData: {
          id: 11,
          first_name: "Simon",
          last_name: "Garfunkel",
          email: "s+g@example.com",
        },
      });

      const firstNameField = await screen.findByLabelText("First name");
      const lastNameField = await screen.findByLabelText("Last name");

      await userEvent.clear(firstNameField);
      await userEvent.clear(lastNameField);

      const submitButton = await screen.findByRole("button", { name: /Update/ });
      await userEvent.click(submitButton);

      const puts = await findRequests("PUT");
      const userPut = puts.find((p) => p.url.includes("/api/user/11"));

      expect(userPut?.body).toEqual({
        first_name: null, // this null key must be present
        last_name: null, // this null key must be present
        email: "s+g@example.com",
        user_group_memberships: [],
        login_attributes: {},
      });
    });
  });
});
