import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
  setupStatefulSettingsEndpoints(settings);
  setupSettingsEndpoints([]);

  renderWithProviders(
    <IllustrationWidget name={name} title={title} description={description} />,
  );

  await screen.findByText(title);
}

const MB = 1024 * 1024;

// jsdom does not decode images, so fire the load or error event that a
// browser fires for an intact or a corrupted image.
function mockImageDecoding({ isIntact }: { isIntact: boolean }) {
  return jest
    .spyOn(HTMLImageElement.prototype, "src", "set")
    .mockImplementation(function (this: HTMLImageElement) {
      setTimeout(() => {
        this.dispatchEvent(new Event(isIntact ? "load" : "error"));
      });
    });
}

async function selectCustomAndUpload(file: File) {
  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.click(screen.getByText("Custom"));
  await userEvent.upload(screen.getByTestId("file-input"), file);
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

    it.each(["no-data-illustration", "no-object-illustration"] as const)(
      "should render the Sailboat default value for %s",
      async (name) => {
        await setup({ name, title: "Illustration" });
        expect(await screen.findByDisplayValue("Sailboat")).toBeInTheDocument();
      },
    );

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

      await userEvent.click(
        await screen.findByRole("button", {
          name: "Remove custom illustration",
        }),
      );
      expect(await screen.findByDisplayValue("Lighthouse")).toBeInTheDocument();

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

  describe("file upload", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should reject an image larger than 2MB", async () => {
      mockImageDecoding({ isIntact: true });
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });

      await selectCustomAndUpload(
        new File(["a".repeat(2 * MB + 1)], "big-file.jpg", {
          type: "image/jpeg",
        }),
      );

      expect(
        await screen.findByText(
          "The image you chose is larger than 2MB. Please choose another one.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("big-file.jpg")).not.toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    it("should reject a corrupted image", async () => {
      mockImageDecoding({ isIntact: false });
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });

      await selectCustomAndUpload(
        new File(["a".repeat(2 * MB)], "corrupted-file.jpg", {
          type: "image/jpeg",
        }),
      );

      expect(
        await screen.findByText(
          "The image you chose is corrupted. Please choose another one.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("corrupted-file.jpg")).not.toBeInTheDocument();
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    it.each([
      "login-page-illustration",
      "landing-page-illustration",
      "no-data-illustration",
      "no-object-illustration",
    ] as const)("should save an uploaded image for %s", async (name) => {
      mockImageDecoding({ isIntact: true });
      await setup({ name, title: "Illustration" });

      await selectCustomAndUpload(
        new File(["logo"], "logo.jpeg", { type: "image/jpeg" }),
      );

      expect(await screen.findByText("logo.jpeg")).toBeInTheDocument();
      const puts = await findRequests("PUT");
      expect(puts.map(({ url, body }) => ({ url, body }))).toEqual([
        {
          url: `http://localhost/api/setting/${name}`,
          body: { value: "custom" },
        },
        {
          url: `http://localhost/api/setting/${name}-custom`,
          body: { value: "data:image/jpeg;base64,bG9nbw==" },
        },
      ]);
    });

    it("should clear the corrupted image error after a valid upload", async () => {
      const imageDecoding = mockImageDecoding({ isIntact: false });
      await setup({
        name: "login-page-illustration",
        title: "Login page illustration",
      });
      await selectCustomAndUpload(
        new File(["corrupted"], "corrupted-file.jpg", { type: "image/jpeg" }),
      );
      const errorMessage =
        "The image you chose is corrupted. Please choose another one.";
      expect(await screen.findByText(errorMessage)).toBeInTheDocument();

      imageDecoding.mockRestore();
      mockImageDecoding({ isIntact: true });
      await userEvent.upload(
        screen.getByTestId("file-input"),
        new File(["logo"], "logo.jpeg", { type: "image/jpeg" }),
      );

      expect(await screen.findByText("logo.jpeg")).toBeInTheDocument();
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
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
