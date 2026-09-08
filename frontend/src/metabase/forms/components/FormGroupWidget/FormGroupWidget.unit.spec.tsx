import userEvent from "@testing-library/user-event";

import { setupGroupsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Form, FormProvider } from "metabase/forms";
import type { GroupId, TokenFeatures } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { FormGroupWidget } from "./FormGroupWidget";

const ALL_USERS = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const DATA_ANALYSTS = createMockGroup({
  id: 2,
  name: "Data Analysts",
  magic_group_type: "data-analyst",
});

const LABEL = "Group";
const ADD_DISABLED_MESSAGE =
  "Adding members to this group requires Advanced Permissions. Members can only be removed.";

const setup = async ({
  tokenFeatures = {},
  currentGroupId = null,
}: {
  tokenFeatures?: Partial<TokenFeatures>;
  currentGroupId?: GroupId | null;
} = {}) => {
  setupGroupsEndpoint([ALL_USERS, DATA_ANALYSTS]);
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  renderWithProviders(
    <FormProvider
      initialValues={{ group_id: currentGroupId }}
      onSubmit={jest.fn()}
    >
      <Form>
        <FormGroupWidget name="group_id" label={LABEL} />
      </Form>
    </FormProvider>,
    { storeInitialState: createMockState({ settings }) },
  );

  await userEvent.click(await screen.findByLabelText(LABEL));
};

const getOption = (name: string) => screen.getByRole("option", { name });

describe("FormGroupWidget", () => {
  it("disables the Data Analysts option without the advanced-permissions feature", async () => {
    await setup();

    expect(getOption("Data Analysts")).toHaveAttribute(
      "data-combobox-disabled",
      "true",
    );
    expect(getOption("All Users")).not.toHaveAttribute(
      "data-combobox-disabled",
    );

    await userEvent.hover(
      within(getOption("Data Analysts")).getByText("Data Analysts"),
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      ADD_DISABLED_MESSAGE,
    );
  });

  it("keeps the gated group selectable when it is already the current one", async () => {
    await setup({ currentGroupId: DATA_ANALYSTS.id });

    expect(getOption("Data Analysts")).not.toHaveAttribute(
      "data-combobox-disabled",
    );

    await userEvent.click(getOption("Data Analysts"));
    expect(await screen.findByLabelText(LABEL)).toHaveValue("Data Analysts");
  });

  it("leaves the Data Analysts option selectable with the advanced-permissions feature", async () => {
    await setup({ tokenFeatures: { advanced_permissions: true } });

    expect(getOption("Data Analysts")).not.toHaveAttribute(
      "data-combobox-disabled",
    );
  });
});
