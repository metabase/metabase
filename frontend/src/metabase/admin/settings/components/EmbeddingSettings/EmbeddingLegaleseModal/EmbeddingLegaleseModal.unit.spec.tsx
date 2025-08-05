import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { EmbeddingLegaleseModal } from "./EmbeddingLegaleseModal";

type SettingKey = "enable-embedding-sdk" | "enable-embedding-simple";

const setup = (setting: SettingKey = "enable-embedding-sdk") => {
  const onClose = jest.fn();

  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupUpdateSettingsEndpoint();

  renderWithProviders(
    <EmbeddingLegaleseModal setting={setting} opened onClose={onClose} />,
  );

  return { onClose };
};

describe("EmbeddingSdkLegaleseModal", () => {
  it.each([
    {
      setting: "enable-embedding-sdk" as const,
      expectedSettingUpdate: {
        "show-sdk-embed-terms": false,
        "enable-embedding-sdk": true,
      },
    },
    {
      setting: "enable-embedding-simple" as const,
      expectedSettingUpdate: {
        "show-simple-embed-terms": false,
        "enable-embedding-simple": true,
      },
    },
  ])(
    "should update the settings and close the modal when the user clicks Accept for $setting",
    async ({ setting, expectedSettingUpdate }) => {
      const { onClose } = setup(setting);

      await userEvent.click(
        screen.getByRole("button", { name: "Agree and continue" }),
        { delay: null },
      );

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const [{ body }] = puts;

      expect(body).toEqual(expectedSettingUpdate);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    },
  );

  it("should not update settings when the user clicks Decline", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByText("Decline and go back"));
    expect(onClose).toHaveBeenCalled();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(0);
  });
});
