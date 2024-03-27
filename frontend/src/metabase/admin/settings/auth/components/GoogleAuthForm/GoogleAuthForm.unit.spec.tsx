import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockSettingDefinition } from "metabase-types/api/mocks";

import type { GoogleAuthFormProps } from "./GoogleAuthForm";
import GoogleAuthForm from "./GoogleAuthForm";

describe("GoogleAuthForm", () => {
  it("should submit the form", async () => {
    const props = getProps();

    render(<GoogleAuthForm {...props} />);
    await userEvent.type(screen.getByLabelText("Client ID"), "id.test");
    await waitFor(() => expect(screen.getByText(/Save/)).toBeEnabled());
    screen.getByText("Save and enable").click();

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith(
        {
          "google-auth-enabled": true,
          "google-auth-client-id": "id.test",
          "google-auth-auto-create-accounts-domain": null,
        },
        expect.anything(),
      );
    });
  });

  it("should not submit the form without required fields", async () => {
    const props = getProps({
      isEnabled: true,
      elements: [
        createMockSettingDefinition({
          key: "google-auth-client-id",
          is_env_setting: false,
        }),
      ],
    });

    render(<GoogleAuthForm {...props} />);
    await userEvent.type(screen.getByLabelText("Domain"), "domain.test");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("should submit the form when required fields set by env vars", async () => {
    const props = getProps({
      isEnabled: true,
      elements: [
        createMockSettingDefinition({
          key: "google-auth-client-id",
          is_env_setting: true,
        }),
      ],
    });

    render(<GoogleAuthForm {...props} />);
    await userEvent.type(screen.getByLabelText("Domain"), "domain.test");
    screen.getByText("Save changes").click();

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledWith(
        {
          "google-auth-enabled": true,
          "google-auth-client-id": null,
          "google-auth-auto-create-accounts-domain": "domain.test",
        },
        expect.anything(),
      );
    });
  });
});

const getProps = (
  opts?: Partial<GoogleAuthFormProps>,
): GoogleAuthFormProps => ({
  isEnabled: false,
  isSsoEnabled: false,
  onSubmit: jest.fn(),
  ...opts,
});
