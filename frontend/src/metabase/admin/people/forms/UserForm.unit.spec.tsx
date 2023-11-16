import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
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
  createMockGroup({ id: 2, name: "Admins" }),
  createMockGroup({ id: 3, name: "foo" }),
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
};

describe("UserForm", () => {
  describe("OSS", () => {
    it("should show the required fields", async () => {
      setup();

      expect(screen.getByLabelText("First name")).toHaveValue("Bobby");
      expect(screen.getByLabelText("Last name")).toHaveValue("Tables");
      expect(screen.getByLabelText("Email")).toHaveValue(
        "bobby.tables@metabase.com",
      );
      // This isn't a proper form input, so we need to grab the label specifically,
      // And can ensure the proper default group is applies
      expect(await screen.findByText("Groups")).toBeInTheDocument();
      expect(await screen.findByText("foo")).toBeInTheDocument();

      expect(screen.queryByText("Attributes")).not.toBeInTheDocument();
    });
  });

  describe("EE", () => {
    it("should show login attributes widget", async () => {
      setup({
        hasEnterprisePlugins: true,
        initialValues: { ...USER, login_attributes: { team: "engineering" } },
      });

      expect(await screen.findByText("Attributes")).toBeInTheDocument();
      expect(await screen.findByText("Add an attribute")).toBeInTheDocument();

      expect(await screen.findByDisplayValue("team")).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue("engineering"),
      ).toBeInTheDocument();
    });
  });
});
