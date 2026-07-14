import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { ImageUploadWidget } from "./ImageUploadWidget";

async function setup({
  name,
  title,
  description,
  settings: settingOverrides = {},
}: {
  name: EnterpriseSettingKey;
  title: string;
  description?: React.ReactNode;
  settings?: Partial<EnterpriseSettings>;
}) {
  const settingValues = {
    "application-logo-url": "app/assets/img/logo.png",
    ...settingOverrides,
  };
  const settings = createMockSettings(settingValues);
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    {
      key: "application-logo-url",
      default: "app/assets/img/logo.png",
      is_env_setting: false,
      description: "The logo of the application",
      env_name: "METABASE_APPLICATION_LOGO_URL",
    },
  ]);
  setupUpdateSettingEndpoint();

  // Seed the bootstrap so the logo-url value is readable on the first render;
  // otherwise the value-derived UI (e.g. "Remove uploaded image") asserted with
  // a synchronous `getByText` can race the settings fetch.
  renderWithProviders(
    <ImageUploadWidget name={name} title={title} description={description} />,
    { storeInitialState: { settings: createMockSettingsState(settingValues) } },
  );

  await screen.findByText(title);
}

describe("ImageUploadWidget", () => {
  it("shows an empty input", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
    });

    // `isDefaultImage` compares the value to the settings-details default, which
    // load from separate requests, so wait for the steady state.
    expect(await screen.findByText("No file chosen")).toBeInTheDocument();
  });

  it("shows that a file has been uploaded", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
      settings: {
        "application-logo-url": "data:image/png;base64,abc123",
      },
    });

    expect(
      await screen.findByText("Remove uploaded image"),
    ).toBeInTheDocument();
  });

  it("shows an image preview", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
      settings: {
        "application-logo-url": "data:image/png;base64,abc123",
      },
    });

    expect(await screen.findByLabelText("Image preview")).toBeInTheDocument();
  });

  it("can remove an uploaded image", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
      settings: {
        "application-logo-url": "data:image/png;base64,abc123",
      },
    });

    await userEvent.click(await screen.findByLabelText("close icon"));

    const [{ url, body }] = await findRequests("PUT");

    expect(url).toMatch(/application-logo-url/);
    expect(body).toEqual({
      value: null,
    });
  });
});
