import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { EmailReplyToWidget } from "./EmailReplyToWidget";

const setup = ({
  value,
  isEnvVar,
}: {
  value: string[] | null;
  isEnvVar?: boolean;
}) => {
  const settings = createMockSettings({
    "email-reply-to": value,
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "email-reply-to",
      ...(isEnvVar
        ? {
            is_env_setting: true,
            env_name: "MB_EMAIL_REPLY_TO",
          }
        : {
            description:
              "The email address you want the replies to go to, if different from the from address.",
            value,
          }),
    }),
  ]);

  return renderWithProviders(
    <div>
      <EmailReplyToWidget />
      <UndoListing />
    </div>,
  );
};

describe("EmailReplyToWidget", () => {
  it("render correctly", async () => {
    setup({ value: ["replies@metatest.com"] });
    const input = await screen.findByRole("textbox");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("replies@metatest.com");
    expect(screen.getByText("Reply-To Address")).toBeInTheDocument();
  });

  it("be empty when value is null", async () => {
    setup({ value: null });
    const input = await screen.findByRole("textbox");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("");
  });

  it("should save an updated setting", async () => {
    setup({ value: ["replies@metatest.com"] });

    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "responses@metatest.com");
    fireEvent.blur(input);

    const inputChanged = await screen.findByRole("textbox");
    expect(inputChanged).toHaveValue("responses@metatest.com");

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/email-reply-to");
    expect(body).toStrictEqual({ value: ["responses@metatest.com"] });
  });

  it("should display a notice instead of input set by an environment variable", async () => {
    setup({
      value: ["ignore@metatest.com"],
      isEnvVar: true,
    });

    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(screen.getByText("MB_EMAIL_REPLY_TO")).toBeInTheDocument();
    expect(screen.getByText(/environment variable./)).toBeInTheDocument();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
