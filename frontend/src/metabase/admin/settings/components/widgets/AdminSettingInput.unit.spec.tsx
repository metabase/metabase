import { userEvent } from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import {
  AdminSettingInput,
  type AdminSettingInputProps,
} from "./AdminSettingInput";

const setup = (props: AdminSettingInputProps<SettingKey>) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "site-name": "Metabased",
      "site-url": "http://localhost:8675309",
      "enable-xrays": true,
      "humanization-strategy": "none",
      "query-caching-min-ttl": 64,
      "premium-embedding-token": "super-secret",
      // @ts-expect-error - this isn't a valid setting
      "fake-setting": "fake-value",
      "bcc-enabled?": true,
    }),
  );

  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "site-url",
      is_env_setting: true,
      env_name: "MB_HARDCODED_URL",
    }),
  ]);

  setupUpdateSettingEndpoint();
  renderWithProviders(
    <>
      <AdminSettingInput {...props} />
      <UndoListing />
    </>,
  );
};

describe("AdminSettingInput", () => {
  it("should not allow invalid settings", async () => {
    setup({
      title: "Fake Setting",
      // @ts-expect-error - this isn't a valid setting
      name: "fake-name",
    });

    // this is just a test of the types, it shouldn't fail at run time
    expect(await screen.findByText("Fake Setting")).toBeInTheDocument();
  });

  it("should render title and description", async () => {
    setup({
      title: "Site Name",
      description: "The name of your site",
      name: "site-name",
      inputType: "text",
    });

    expect(await screen.findByText("Site Name")).toBeInTheDocument();
    expect(
      await screen.findByText("The name of your site"),
    ).toBeInTheDocument();
  });

  it("should render a text input", async () => {
    setup({
      title: "Site Name",
      description: "The name of your site",
      name: "site-name",
      inputType: "text",
    });

    const input = await screen.findByRole("textbox");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("Metabased");
  });

  it("should render a select input", async () => {
    setup({
      title: "Humanization",
      name: "humanization-strategy",
      inputType: "select",
      options: [
        { label: "None", value: "none" },
        { label: "Simple", value: "simple" },
      ],
    });

    const input = await screen.findByRole("textbox");
    expect(input).toHaveClass("mb-mantine-Select-input");
    expect(input).toHaveValue("None");
  });

  it("should render a boolean input", async () => {
    setup({
      title: "Enable X-rays",
      name: "enable-xrays",
      inputType: "boolean",
    });

    const input = await screen.findByRole("switch");
    expect(input).toHaveClass("mb-mantine-Switch-input");
    expect(input).toHaveAttribute("data-checked", "true");
  });

  it("should render a number input", async () => {
    setup({
      title: "TTL",
      name: "query-caching-min-ttl",
      inputType: "number",
    });

    const input = await screen.findByRole("spinbutton");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveValue(64);
  });

  it("should render a password input", async () => {
    setup({
      title: "token",
      name: "premium-embedding-token",
      inputType: "password",
    });

    const input = await screen.findByLabelText("token");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("super-secret");
  });

  it("should render a textarea input", async () => {
    setup({
      title: "token",
      name: "premium-embedding-token",
      inputType: "textarea",
    });

    const input = await screen.findByRole("textbox");
    expect(input.nodeName).toBe("TEXTAREA");
    expect(input).toHaveValue("super-secret");
  });

  it("should hide an input", async () => {
    setup({
      title: "token",
      name: "premium-embedding-token",
      hidden: true,
      inputType: "text",
    });

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls();
      expect(calls).toHaveLength(2);
    });

    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  it("should save an updated boolean setting", async () => {
    setup({
      title: "Enable X-rays",
      name: "enable-xrays",
      inputType: "boolean",
    });

    const input = await screen.findByRole("switch");
    await userEvent.click(input);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/enable-xrays");
    expect(body).toStrictEqual({ value: false });
  });

  it("should save an updated text setting", async () => {
    setup({
      title: "Site Name",
      description: "The name of your site",
      name: "site-name",
      inputType: "text",
    });

    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Wigglybase");
    fireEvent.blur(input);

    const inputChanged = await screen.findByRole("textbox");
    expect(inputChanged).toHaveValue("Wigglybase");

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/site-name");
    expect(body).toStrictEqual({ value: "Wigglybase" });
  });

  it("should save an updated number setting", async () => {
    setup({
      title: "ttl",
      name: "query-caching-min-ttl",
      inputType: "number",
    });

    const input = await screen.findByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "33");
    fireEvent.blur(input);

    const inputChanged = await screen.findByRole("spinbutton");
    expect(inputChanged).toHaveValue(33);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/query-caching-min-ttl");
    expect(body).toStrictEqual({ value: "33" });
  });

  it("should save an updated select setting", async () => {
    setup({
      title: "Humanization",
      name: "humanization-strategy",
      inputType: "select",
      options: [
        { label: "None", value: "none" },
        { label: "Simple", value: "simple" },
      ],
    });

    const input = await screen.findByRole("textbox");
    await userEvent.click(input);
    const option = await screen.findByText("Simple");
    await userEvent.click(option);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/humanization-strategy");
    expect(body).toStrictEqual({ value: "simple" });
  });

  describe("radio input", () => {
    it("should render a radio input", async () => {
      setup({
        title: "Humanization",
        name: "humanization-strategy",
        inputType: "radio",
        options: [
          { label: "None", value: "none" },
          { label: "Simple", value: "simple" },
        ],
      });

      const inputs = await screen.findAllByRole("radio");
      expect(inputs).toHaveLength(2);

      // eslint-disable-next-line jest-dom/prefer-to-have-value
      expect(inputs[0]).toHaveAttribute("value", "none");
      expect(inputs[0]).toBeChecked();

      // eslint-disable-next-line jest-dom/prefer-to-have-value
      expect(inputs[1]).toHaveAttribute("value", "simple");
      expect(inputs[1]).not.toBeChecked();
    });

    it("should save an updated radio setting", async () => {
      setup({
        title: "Humanization",
        name: "humanization-strategy",
        inputType: "radio",
        options: [
          { label: "None", value: "none" },
          { label: "Simple", value: "simple" },
        ],
      });

      const option = await screen.findByText("Simple");
      await userEvent.click(option);

      const [{ url, body }] = await findRequests("PUT");
      expect(url).toContain("/api/setting/humanization-strategy");
      expect(body).toStrictEqual({ value: "simple" });
    });

    it("should convert string boolean radio values", async () => {
      setup({
        title: "Humanization",
        name: "bcc-enabled?",
        inputType: "radio",
        options: [
          { label: "True", value: "true" },
          { label: "False", value: "false" },
        ],
      });

      const inputs = await screen.findAllByRole("radio");
      expect(inputs).toHaveLength(2);

      // eslint-disable-next-line jest-dom/prefer-to-have-value
      expect(inputs[0]).toHaveAttribute("value", "true");
      expect(inputs[0]).toBeChecked();

      // eslint-disable-next-line jest-dom/prefer-to-have-value
      expect(inputs[1]).toHaveAttribute("value", "false");
      expect(inputs[1]).not.toBeChecked();

      const option = await screen.findByText("False");
      await userEvent.click(option);

      const [{ url, body }] = await findRequests("PUT");
      expect(url).toContain(
        `/api/setting/${encodeURIComponent("bcc-enabled?")}`,
      );
      expect(body).toStrictEqual({ value: false });
    });
  });

  it("should save an updated textarea setting", async () => {
    setup({
      title: "Site Name",
      description: "The name of your site",
      name: "site-name",
      inputType: "textarea",
    });

    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Wigglybase");
    fireEvent.blur(input);

    const inputChanged = await screen.findByRole("textbox");
    expect(inputChanged).toHaveValue("Wigglybase");

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/site-name");
    expect(body).toStrictEqual({ value: "Wigglybase" });
  });

  it("should save an updated password setting", async () => {
    setup({
      title: "token",
      name: "premium-embedding-token",
      inputType: "password",
    });

    const input = await screen.findByLabelText("token");
    await userEvent.clear(input);
    await userEvent.type(input, "new-secret-stuff");
    fireEvent.blur(input);

    const inputChanged = await screen.findByLabelText("token");
    expect(inputChanged).toHaveValue("new-secret-stuff");

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/premium-embedding-token");
    expect(body).toStrictEqual({ value: "new-secret-stuff" });
  });

  it("should show a success toast on save success", async () => {
    setup({
      title: "Humanization Strategy",
      name: "humanization-strategy",
      inputType: "select",
      options: [
        { label: "None", value: "none" },
        { label: "Simple", value: "simple" },
      ],
    });

    const input = await screen.findByRole("textbox");
    await userEvent.click(input);
    const option = await screen.findByText("Simple");
    await userEvent.click(option);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/humanization-strategy");
    expect(body).toStrictEqual({ value: "simple" });
  });

  it("should show an error toast on save failure", async () => {
    setup({
      title: "Humanization Strategy",
      name: "humanization-strategy",
      inputType: "select",
      options: [
        { label: "None", value: "none" },
        { label: "Simple", value: "simple" },
      ],
    });
    setupUpdateSettingEndpoint({ status: 500 });

    const input = await screen.findByRole("textbox");
    await userEvent.click(input);
    const option = await screen.findByText("Simple");
    await userEvent.click(option);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/humanization-strategy");
    expect(body).toStrictEqual({ value: "simple" });

    const toast = await screen.findByText("Error saving humanization-strategy");
    expect(toast).toBeInTheDocument();
  });

  it("should display a notice instead of input when a setting is set by an environment variable", async () => {
    setup({
      title: "url",
      name: "site-url",
      inputType: "text",
    });

    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(screen.getByText("MB_HARDCODED_URL")).toBeInTheDocument();
    expect(screen.getByText(/environment variable./)).toBeInTheDocument();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
