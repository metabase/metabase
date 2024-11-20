import userEvent from "@testing-library/user-event";

import {
  getIcon,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";

import { type SetupOpts, setup } from "./setup";

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

function setupCommon(opts?: Partial<SetupOpts>) {
  return setup({
    ...opts,
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });
}

describe("PublicOrEmbeddedQuestion", () => {
  it("should render data", async () => {
    await setupCommon();
    expect(await screen.findByText("John W.")).toBeInTheDocument();
  });

  it("should update card settings when visualization component changes them (metabase#37429)", async () => {
    await setupCommon();

    await userEvent.click(
      await screen.findByRole("button", {
        name: /update settings/i,
      }),
    );

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("settings")).toHaveTextContent(
      JSON.stringify({ foo: "bar" }),
    );
  });

  describe("downloads flag", () => {
    it("should allow downloading the results when downloads are enabled", async () => {
      await setupCommon({ hash: { downloads: "true" } });

      await userEvent.click(getIcon("download"));

      expect(
        within(screen.getByRole("dialog")).getByRole("heading", {
          name: /download/i,
        }),
      ).toBeInTheDocument();
    });

    it('should not hide download button when downloads are disabled without "whitelabel" feature', async () => {
      await setupCommon({ hash: { downloads: "false" } });

      expect(getIcon("download")).toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupCommon();

      await userEvent.hover(getIcon("download"));

      expect(screen.getByText("Download full results")).toBeInTheDocument();
    });

    it('should not set the locale to "ko" without "whitelabel" feature', async () => {
      await setupCommon({ hash: { locale: "ko" } });

      await userEvent.hover(getIcon("download"));

      expect(screen.getByText("Download full results")).toBeInTheDocument();
    });
  });
});
