import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SiteUrlWidget } from "./SiteUrlWidget";

const setup = (props: { isHosted?: boolean }) => {
  const siteUrlWidgetSettings = {
    "site-url": "http://mysite.biz",
    "token-features": createMockTokenFeatures({
      hosting: Boolean(props.isHosted),
    }),
  } as const;

  const settings = createMockSettings(siteUrlWidgetSettings);

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  return renderWithProviders(
    <div>
      <SiteUrlWidget />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("siteUrlWidget", () => {
  it("should render a SiteUrlWidget", async () => {
    setup({});
    expect(await screen.findByText("Site url")).toBeInTheDocument();
  });

  it("should load existing value", async () => {
    setup({});
    const selectInput = await screen.findByRole("textbox", {
      name: "input-prefix",
    });
    expect(selectInput).toHaveValue("http://");

    const textInput = await screen.findByDisplayValue("mysite.biz");
    expect(textInput).toBeVisible();
  });

  it("should update the value", async () => {
    setup({});
    const input = await screen.findByDisplayValue("mysite.biz");
    await userEvent.clear(input);
    await userEvent.type(input, "newsite.guru");
    await fireEvent.blur(input);
    await screen.findByDisplayValue("newsite.guru");

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/\/api\/setting\/site-url/);
    expect(body).toEqual({ value: "http://newsite.guru" });
  });

  it("can change from http to https", async () => {
    setup({});
    await userEvent.click(
      await screen.findByRole("textbox", { name: "input-prefix" }),
    );
    await userEvent.click(await screen.findByText("https://"));

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/\/api\/setting\/site-url/);
    expect(body).toEqual({ value: "https://mysite.biz" });
  });

  it("should show success toast", async () => {
    setup({});
    const input = await screen.findByDisplayValue("mysite.biz");
    await userEvent.clear(input);
    await userEvent.type(input, "newsite.guru");
    await fireEvent.blur(input);
    await screen.findByDisplayValue("newsite.guru");

    expect(
      await screen.findByLabelText("check_filled icon"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("should show error message", async () => {
    setup({});
    setupUpdateSettingEndpoint({ status: 500 });

    const input = await screen.findByDisplayValue("mysite.biz");
    await userEvent.clear(input);
    await userEvent.type(input, "newsite.guru");
    await fireEvent.blur(input);
    await screen.findByDisplayValue("newsite.guru");

    expect(
      await screen.findByText("Error saving Site URL"),
    ).toBeInTheDocument();
  });

  it("should not render if it's hosted", async () => {
    setup({ isHosted: true });
    expect(screen.queryByText("Site url")).not.toBeInTheDocument();
  });
});
