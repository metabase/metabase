import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { findRequests } from "__support__/utils";
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
  const settings = createMockSettings({
    "application-logo-url": "app/assets/img/logo.png",
    ...settingOverrides,
  });
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

  renderWithProviders(
    <ImageUploadWidget name={name} title={title} description={description} />,
  );

  await screen.findByText(title);
}

describe("ImageUploadWidget", () => {
  it("shows an empty input", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
    });

    expect(screen.getByText("No file chosen")).toBeInTheDocument();
  });

  it("shows that a file has been uploaded", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
      settings: {
        "application-logo-url": "data:image/png;base64,abc123",
      },
    });

    expect(screen.getByText("Remove uploaded image")).toBeInTheDocument();
  });

  it("shows an image preview", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
      settings: {
        "application-logo-url": "data:image/png;base64,abc123",
      },
    });

    expect(screen.getByLabelText("Image preview")).toBeInTheDocument();
  });

  it("can remove an uploaded image", async () => {
    await setup({
      name: "application-logo-url",
      title: "Application logo",
      settings: {
        "application-logo-url": "data:image/png;base64,abc123",
      },
    });

    await userEvent.click(screen.getByLabelText("close icon"));

    const [{ url, body }] = await findRequests("PUT");

    expect(url).toMatch(/application-logo-url/);
    expect(body).toEqual({
      value: null,
    });
  });
});
