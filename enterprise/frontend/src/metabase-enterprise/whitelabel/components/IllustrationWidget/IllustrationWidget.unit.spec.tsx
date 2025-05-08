import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { findRequests } from "__support__/utils";
import type {
  EnterpriseSettingKey,
  EnterpriseSettings,
} from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { IllustrationWidget } from "./IllustrationWidget";

type IllustrationSetting = Extract<
  EnterpriseSettingKey,
  | "login-page-illustration"
  | "landing-page-illustration"
  | "no-data-illustration"
  | "no-object-illustration"
>;

interface SetupOpts {
  name: IllustrationSetting;
  title: string;
  description?: React.ReactNode;
  settings?: Partial<EnterpriseSettings>;
}

async function setup({
  name,
  title,
  description,
  settings: settingOverrides = {},
}: SetupOpts) {
  const settings = createMockSettings({
    "login-page-illustration": "default",
    "login-page-illustration-custom": "",
    "landing-page-illustration": "default",
    "landing-page-illustration-custom": "",
    "no-data-illustration": "default",
    "no-data-illustration-custom": "",
    "no-object-illustration": "default",
    "no-object-illustration-custom": "",
    ...settingOverrides,
  });
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(
    <IllustrationWidget name={name} title={title} description={description} />,
  );

  await screen.findByText(title);
}

describe("IllustrationWidget", () => {
  describe("select options", () => {
    it("should render default value", async () => {
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });
      expect(await screen.findByDisplayValue("Lighthouse")).toBeInTheDocument();
      expect(screen.getByText("Login page illustration")).toBeInTheDocument();
    });

    it("should render options", async () => {
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });
      await userEvent.click(screen.getByRole("textbox"));
      expect(screen.getByText("Lighthouse")).toBeInTheDocument();
      expect(screen.getByText("No illustration")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("should allow setting 'No illustration' option", async () => {
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });
      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText("No illustration"));

      const [put] = await findRequests("PUT");
      expect(put.url).toMatch(/login-page-illustration/);
      expect(put.body).toEqual({
        value: "none",
      });
    });

    it("should not set anything after selecting 'Custom' option, but not uploading any file", async () => {
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });
      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText("Custom"));

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(0);
    });

    /**
     * We couldn't test uploading an image because it relies on image.onerror and image.onload
     * which don't seem to be supported by jsdom. However the file upload test cases has already
     * been covered in E2E tests.
     */

    it("should not remove the custom uploaded image after changing the option away from custom", async () => {
      const fakeImage = new Blob(["fake-image"], {
        type: "image/png",
      }).toString();

      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
        settings: {
          "login-page-illustration": "custom",
          "login-page-illustration-custom": fakeImage,
        },
      });
      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText("No illustration"));

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      const [put] = puts;
      expect(put.url).toEqual(
        "http://localhost/api/setting/login-page-illustration",
      );
      expect(put.body).toEqual({
        value: "none",
      });
    });

    it("should remove the custom uploaded image when clicking the remove button", async () => {
      const fakeImage = new Blob(["fake-image"], {
        type: "image/png",
      }).toString();

      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
        settings: {
          "login-page-illustration": "custom",
          "login-page-illustration-custom": fakeImage,
        },
      });

      await userEvent.click(await screen.findByLabelText("close icon"));

      await waitFor(async () => {
        const puts = await findRequests("PUT");
        expect(puts).toHaveLength(2);
      });

      const [put1, put2] = await findRequests("PUT");
      expect(put1.url).toEqual(
        "http://localhost/api/setting/login-page-illustration",
      );
      expect(put1.body).toEqual({
        value: "default",
      });
      expect(put2.url).toEqual(
        "http://localhost/api/setting/login-page-illustration-custom",
      );
      expect(put2.body).toEqual({
        value: null,
      });
    });
  });

  describe("select the same option twice", () => {
    it("should update if the setting hasn't changed", async () => {
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });
      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText("Lighthouse"));

      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText("Lighthouse"));

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(0);
    });

    it("should not update when selecting 'Custom' option twice", async () => {
      const fakeImage = new Blob(["fake-image"], {
        type: "image/png",
      }).toString();

      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
        settings: {
          "login-page-illustration": "custom",
          "login-page-illustration-custom": fakeImage,
        },
      });

      await userEvent.click(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText("Custom"));
      expect(screen.queryByText("Custom")).not.toBeInTheDocument();

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(0);
    });
  });
});
