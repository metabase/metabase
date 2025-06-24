import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { SiteUrlWidget } from "./SiteUrlWidget";

const setup = () => {
  setupPropertiesEndpoints(
    createMockSettings({
      "site-url": "http://mysite.biz",
    }),
  );
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "site-url",
      value: "http://mysite.biz",
    }),
  ]);

  return renderWithProviders(
    <div>
      <SiteUrlWidget />
      <UndoListing />
    </div>,
  );
};

describe("siteUrlWidget", () => {
  it("should render a SiteUrlWidget", async () => {
    setup();
    expect(await screen.findByText("Site Url")).toBeInTheDocument();
  });

  it("should load existing value", async () => {
    setup();
    const selectInput = await screen.findByLabelText("input-prefix");
    expect(selectInput).toHaveValue("http://");

    const textInput = await screen.findByDisplayValue("mysite.biz");
    expect(textInput).toBeVisible();
  });

  it("should update the value", async () => {
    setup();
    const input = await screen.findByDisplayValue("mysite.biz");
    await userEvent.clear(input);
    await userEvent.type(input, "newsite.guru");
    await fireEvent.blur(input);
    await screen.findByDisplayValue("newsite.guru");

    const [putUrl, putDetails] = await findPut();
    expect(putUrl).toMatch(/\/api\/setting\/site-url/);
    expect(putDetails).toEqual({ value: "http://newsite.guru" });
  });

  it("can change from http to https", async () => {
    setup();
    await userEvent.click(await screen.findByLabelText("input-prefix"));
    await userEvent.click(await screen.findByText("https://"));

    const [putUrl, putDetails] = await findPut();
    expect(putUrl).toMatch(/\/api\/setting\/site-url/);
    expect(putDetails).toEqual({ value: "https://mysite.biz" });
  });

  it("should show success toast", async () => {
    setup();
    const input = await screen.findByDisplayValue("mysite.biz");
    await userEvent.clear(input);
    await userEvent.type(input, "newsite.guru");
    await fireEvent.blur(input);
    await screen.findByDisplayValue("newsite.guru");

    expect(await screen.findByLabelText("check icon")).toBeInTheDocument();
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("should show error message", async () => {
    setup();
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
});

async function findPut() {
  const calls = fetchMock.calls();
  const [putUrl, putDetails] =
    calls.find((call) => call[1]?.method === "PUT") ?? [];

  const body = ((await putDetails?.body) as string) ?? "{}";

  return [putUrl, JSON.parse(body)];
}
