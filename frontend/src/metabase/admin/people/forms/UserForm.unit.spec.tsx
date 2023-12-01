import fetchMock from "fetch-mock";

import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { mockSettings } from "__support__/settings";
import { setupEnterprisePlugins } from "__support__/enterprise";

import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { UserForm } from "./UserForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const USER = createMockUser({
  first_name: "Bobby",
  last_name: "Tables",
  email: "bobby.tables@metabase.com",
  user_group_memberships: [
    { id: 1, is_group_manager: false },
    { id: 3, is_group_manager: false },
  ],
});

const setup = ({ hasEnterprisePlugins = false, initialValues = USER } = {}) => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();

  fetchMock.get("path:/api/permissions/group", GROUPS);

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        sandboxes: true,
      }),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <UserForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      initialValues={initialValues}
    />,
    {
      storeInitialState: state,
    },
  );

  return {
    onSubmit,
  };
};

describe("UserForm", () => {
  describe("OSS", () => {
    it("should show the required fields", async () => {
      setup();

      expect(screen.getByLabelText("First name")).toHaveValue("Bobby");
      expect(screen.getByLabelText("Last name")).toHaveValue("Tables");
      expect(screen.getByLabelText(/Email/)).toHaveValue(
        "bobby.tables@metabase.com",
      );
      // This isn't a proper form input, so we need to grab the label specifically,
      // And can ensure the proper default group is applied
      expect(await screen.findByText("Groups")).toBeInTheDocument();
      expect(await screen.findByText("foo")).toBeInTheDocument();

      expect(screen.queryByText("Attributes")).not.toBeInTheDocument();
    });

    it("should allow you to add groups", async () => {
      const { onSubmit } = setup();

      userEvent.click(await screen.findByText("foo"));
      userEvent.click(await screen.findByText("Administrators"));

      expect(
        await screen.findByRole("generic", { name: "group-summary" }),
      ).toHaveTextContent("Admin and 1 other group");

      userEvent.click(await screen.findByText("bar"));

      expect(
        await screen.findByRole("generic", { name: "group-summary" }),
      ).toHaveTextContent("Admin and 2 other groups");

      expect(
        await screen.findByRole("button", { name: "Update" }),
      ).toBeEnabled();

      userEvent.click(await screen.findByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...USER,
            user_group_memberships: [
              {
                id: 1,
                is_group_manager: false,
              },
              {
                id: 3,
                is_group_manager: false,
              },
              {
                id: 2,
                is_group_manager: false,
              },
              {
                id: 4,
                is_group_manager: false,
              },
            ],
          },
          expect.anything(),
        );
      });
    });

    it("should allow you to remove a group", async () => {
      const { onSubmit } = setup();

      userEvent.click(await screen.findByText("foo"));
      userEvent.click(await screen.findByRole("listitem", { name: "foo" }));

      expect(
        await screen.findByRole("generic", { name: "group-summary" }),
      ).toHaveTextContent("Default");

      userEvent.click(await screen.findByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...USER,
            user_group_memberships: [
              {
                id: 1,
                is_group_manager: false,
              },
            ],
          },
          expect.anything(),
        );
      });
    });
  });

  describe("EE", () => {
    const eeUser = { ...USER, login_attributes: { team: "engineering" } };

    it("should show login attributes widget", async () => {
      setup({
        hasEnterprisePlugins: true,
        initialValues: eeUser,
      });

      expect(await screen.findByText("Attributes")).toBeInTheDocument();
      expect(await screen.findByText("Add an attribute")).toBeInTheDocument();

      expect(await screen.findByDisplayValue("team")).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue("engineering"),
      ).toBeInTheDocument();
    });

    it("should allow you to add a login attribute", async () => {
      const { onSubmit } = setup({
        hasEnterprisePlugins: true,
        initialValues: eeUser,
      });

      userEvent.click(await screen.findByText("Add an attribute"));

      userEvent.type((await screen.findAllByPlaceholderText("Key"))[1], "exp");
      userEvent.type(
        (await screen.findAllByPlaceholderText("Value"))[1],
        "1234",
      );

      userEvent.click(await screen.findByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...eeUser,
            login_attributes: {
              team: "engineering",
              exp: "1234",
            },
          },
          expect.anything(),
        );
      });
    });

    it("should allow you to remove a login attribute", async () => {
      const { onSubmit } = setup({
        hasEnterprisePlugins: true,
        initialValues: eeUser,
      });

      userEvent.click(await screen.findByTestId("remove-mapping"));

      userEvent.click(await screen.findByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...eeUser,
            login_attributes: {},
          },
          expect.anything(),
        );
      });
    });

    it("should should not change the order of the inputs when working with numbers (#35316)", async () => {
      setup({
        hasEnterprisePlugins: true,
        initialValues: eeUser,
      });

      userEvent.click(await screen.findByText("Add an attribute"));

      userEvent.type((await screen.findAllByPlaceholderText("Key"))[1], "1");

      expect((await screen.findAllByPlaceholderText("Key"))[1]).toHaveValue(
        "1",
      );
    });

    it("should show errors messages and disable form submit when 2 login attributes have the same key (#30196)", async () => {
      setup({
        hasEnterprisePlugins: true,
        initialValues: eeUser,
      });

      userEvent.click(await screen.findByText("Add an attribute"));

      // We need a delay in typing into the form so that the error
      // state is handled apropriately. Formik clears errors when you call
      // setValue, so we need to ensure that no other setValue calls are in
      // flight before typing the letter can causes the error.
      await userEvent.type(
        (
          await screen.findAllByPlaceholderText("Key")
        )[1],
        "team",
        { delay: 100 },
      );

      expect(
        await screen.findAllByText("Attribute keys can't have the same name"),
      ).toHaveLength(2);

      await waitFor(async () =>
        expect(
          await screen.findByRole("button", { name: "Update" }),
        ).toBeDisabled(),
      );
    });
  });
});
