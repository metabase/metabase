import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { findRequests } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockTenant,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EditTenantModal } from "./EditTenantModal";

const LOGO = "data:image/png;base64,bG9nbw==";
const TENANT = createMockTenant({
  id: 1,
  name: "Acme",
  slug: "acme",
  pdf_export_logo: LOGO,
});

const setup = ({ isWhitelabeled }: { isWhitelabeled: boolean }) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      tenants: true,
      whitelabel: isWhitelabeled,
    }),
  });
  setupEnterprisePlugins();
  fetchMock.get(`path:/api/ee/tenant/${TENANT.id}`, TENANT);
  fetchMock.put(`path:/api/ee/tenant/${TENANT.id}`, TENANT);

  renderWithProviders(
    <EditTenantModal
      params={{ tenantId: String(TENANT.id) }}
      onClose={jest.fn()}
    />,
    { storeInitialState: createMockState({ settings }) },
  );
};

const renameTenant = async () => {
  const nameInput = await screen.findByDisplayValue(TENANT.name);
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, "Acme Corp");
  await userEvent.click(screen.getByRole("button", { name: "Update" }));
};

const getUpdateBody = async () => {
  await waitFor(async () => expect(await findRequests("PUT")).toHaveLength(1));
  const [put] = await findRequests("PUT");
  return put.body;
};

describe("EditTenantModal", () => {
  it("sends the tenant's PDF export logo with the update", async () => {
    setup({ isWhitelabeled: true });

    await renameTenant();

    expect(await getUpdateBody()).toMatchObject({
      name: "Acme Corp",
      pdf_export_logo: LOGO,
    });
  });

  it("does not send a leftover logo without the whitelabel feature", async () => {
    setup({ isWhitelabeled: false });

    await renameTenant();

    expect(await getUpdateBody()).not.toHaveProperty("pdf_export_logo");
  });
});
