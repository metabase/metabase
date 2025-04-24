import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { BccToggleWidget } from "./BccToggleWidget";

const setup = ({ value, isEnvVar }: { value: boolean; isEnvVar?: boolean }) => {
  const settings = createMockSettings({
    "bcc-enabled?": value,
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "bcc-enabled?",
      ...(isEnvVar
        ? {
            is_env_setting: true,
            env_name: "MB_BCC_ENABLE",
          }
        : {
            description:
              "Whether or not bcc emails are enabled, default behavior is that it is",
            value,
          }),
    }),
  ]);

  return renderWithProviders(
    <div>
      <BccToggleWidget />
      <UndoListing />
    </div>,
  );
};

describe("BccToggleWidget", () => {
  it("render correctly", async () => {
    setup({ value: true });
    const bccInputs = await screen.findAllByRole("radio");
    expect(bccInputs).toHaveLength(2);

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(bccInputs[0]).toHaveAttribute("value", "true");
    expect(bccInputs[0]).toBeChecked();
    expect(screen.getByText("BCC - Hide recipients")).toBeInTheDocument();

    // eslint-disable-next-line jest-dom/prefer-to-have-value
    expect(bccInputs[1]).toHaveAttribute("value", "false");
    expect(bccInputs[1]).not.toBeChecked();
    expect(screen.getByText("CC - Disclose recipients")).toBeInTheDocument();

    expect(screen.getByText("Add Recipients as CC or BCC")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Whether or not bcc emails are enabled, default behavior is that it is",
      ),
    ).toBeInTheDocument();
  });

  it("should enable bcc correctly", async () => {
    setup({ value: false });

    const radioButtons = await screen.findAllByRole("radio");
    expect(radioButtons).toHaveLength(2);

    await userEvent.click(radioButtons[0]);

    expect(radioButtons[0]).toBeChecked();
    expect(radioButtons[1]).not.toBeChecked();

    const [putUrl, body] = await findPut();
    expect(putUrl).toContain(
      `/api/setting/${encodeURIComponent("bcc-enabled?")}`,
    );
    expect(body).toStrictEqual({ value: true });
  });

  it("should disable bcc correctly", async () => {
    setup({ value: true });

    const radioButtons = await screen.findAllByRole("radio");
    expect(radioButtons).toHaveLength(2);

    await userEvent.click(radioButtons[1]);

    expect(radioButtons[0]).not.toBeChecked();
    expect(radioButtons[1]).toBeChecked();

    const [putUrl, body] = await findPut();
    expect(putUrl).toContain(
      `/api/setting/${encodeURIComponent("bcc-enabled?")}`,
    );
    expect(body).toStrictEqual({ value: false });
  });

  it("should display a notice instead of input set by an environment variable", async () => {
    setup({
      value: true,
      isEnvVar: true,
    });

    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(screen.getByText("MB_BCC_ENABLE")).toBeInTheDocument();
    expect(screen.getByText(/environment variable./)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

async function findPut() {
  const calls = fetchMock.calls();
  const [putUrl, putDetails] =
    calls.find((call) => call[1]?.method === "PUT") ?? [];

  const body = ((await putDetails?.body) as string) ?? "{}";

  return [putUrl, JSON.parse(body)];
}
