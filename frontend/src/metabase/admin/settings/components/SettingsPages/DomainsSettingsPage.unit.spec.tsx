import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import * as domUtils from "metabase/utils/dom";
import type { SettingDefinition } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { DomainsSettingsPage } from "./DomainsSettingsPage";

const IFRAME_HOSTS_LABEL = "Allowed domains for iframes in dashboards";
const IMAGE_HOSTS_LABEL = "Allowed domains for images";
const CSP_SWITCH_NAME = /Restrict image domains/i;

type SetupOpts = {
  iframeHosts?: string;
  cspImgEnabled?: boolean;
  imageHosts?: string;
  customVizEnabled?: boolean;
  settingDefinitions?: SettingDefinition[];
  saveStatus?: number;
};

const setup = async ({
  iframeHosts = "youtube.com",
  cspImgEnabled = true,
  imageHosts = "imgcdn.example.com",
  customVizEnabled = false,
  settingDefinitions,
  saveStatus = 204,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "allowed-iframe-hosts": iframeHosts,
    "csp-img-enabled": cspImgEnabled,
    "csp-img-allowed-hosts": imageHosts,
    "custom-viz-enabled": customVizEnabled,
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingsEndpoint({ status: saveStatus });
  setupSettingsEndpoints(
    settingDefinitions ?? [
      createMockSettingDefinition({
        key: "allowed-iframe-hosts",
        value: iframeHosts,
      }),
      createMockSettingDefinition({
        key: "csp-img-enabled",
        value: cspImgEnabled,
      }),
      createMockSettingDefinition({
        key: "csp-img-allowed-hosts",
        value: imageHosts,
      }),
    ],
  );

  renderWithProviders(<Route path="*" element={<DomainsSettingsPage />} />, {
    withRouter: true,
    withUndos: true,
    initialRoute: "/admin/settings/domains",
  });

  await screen.findByText("Domains");
};

describe("DomainsSettingsPage", () => {
  beforeEach(() => {
    jest.spyOn(domUtils, "reload").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should load existing values", async () => {
    await setup();

    expect(screen.getByLabelText(IFRAME_HOSTS_LABEL)).toHaveValue(
      "youtube.com",
    );
    expect(screen.getByLabelText(IMAGE_HOSTS_LABEL)).toHaveValue(
      "imgcdn.example.com",
    );
    expect(screen.getByRole("switch", { name: CSP_SWITCH_NAME })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("should save changed settings and reload (metabase#80489)", async () => {
    await setup();

    await userEvent.clear(screen.getByLabelText(IFRAME_HOSTS_LABEL));
    await userEvent.type(
      screen.getByLabelText(IFRAME_HOSTS_LABEL),
      "vimeo.com",
    );

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeEnabled();
    expect(domUtils.reload).not.toHaveBeenCalled();

    await userEvent.click(save);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toMatch(/\/api\/setting$/);
    expect(body).toEqual({
      "allowed-iframe-hosts": "vimeo.com",
      "csp-img-enabled": true,
      "csp-img-allowed-hosts": "imgcdn.example.com",
    });
    expect(domUtils.reload).toHaveBeenCalledTimes(1);
  });

  it("should persist an empty iframe-hosts field as a single space so the default list does not return (metabase#55373)", async () => {
    await setup();

    await userEvent.clear(screen.getByLabelText(IFRAME_HOSTS_LABEL));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const [{ body }] = await findRequests("PUT");
    expect(body["allowed-iframe-hosts"]).toBe(" ");
  });

  it("should show a blank iframe-hosts field when the saved value is a single space", async () => {
    await setup({ iframeHosts: " " });

    expect(screen.getByLabelText(IFRAME_HOSTS_LABEL)).toHaveValue("");
  });

  it("should persist an empty image-hosts field as null, not a single space", async () => {
    await setup();

    await userEvent.clear(screen.getByLabelText(IMAGE_HOSTS_LABEL));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const [{ body }] = await findRequests("PUT");
    expect(body["csp-img-allowed-hosts"]).toBeNull();
  });

  it("should show an error toast and not reload when save fails", async () => {
    await setup({ saveStatus: 500 });

    await userEvent.type(screen.getByLabelText(IFRAME_HOSTS_LABEL), ".extra");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Error saving changes")).toBeInTheDocument();
    expect(domUtils.reload).not.toHaveBeenCalled();
  });

  it("should disable the image-hosts field until Restrict image domains is on", async () => {
    await setup({ cspImgEnabled: false });

    const imageHosts = screen.getByLabelText(IMAGE_HOSTS_LABEL);
    expect(imageHosts).toBeDisabled();

    await userEvent.click(
      screen.getByRole("switch", { name: CSP_SWITCH_NAME }),
    );
    expect(imageHosts).toBeEnabled();
  });

  it("should disable Restrict image domains when custom visualizations are enabled", async () => {
    await setup({ customVizEnabled: true });

    expect(
      screen.getByRole("switch", { name: CSP_SWITCH_NAME }),
    ).toBeDisabled();
  });

  it("should show the env var message instead of the input when a setting is set from the environment", async () => {
    await setup({
      settingDefinitions: [
        createMockSettingDefinition({
          key: "allowed-iframe-hosts",
          is_env_setting: true,
          env_name: "MB_ALLOWED_IFRAME_HOSTS",
        }),
        createMockSettingDefinition({
          key: "csp-img-enabled",
          value: true,
        }),
        createMockSettingDefinition({
          key: "csp-img-allowed-hosts",
          value: "imgcdn.example.com",
        }),
      ],
    });

    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(screen.getByText("MB_ALLOWED_IFRAME_HOSTS")).toBeInTheDocument();
    expect(screen.queryByLabelText(IFRAME_HOSTS_LABEL)).not.toBeInTheDocument();
    expect(screen.getByLabelText(IMAGE_HOSTS_LABEL)).toBeInTheDocument();
  });
});
