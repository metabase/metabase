import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { ContentTranslationConfiguration } from "../ContentTranslationConfiguration";

const setup = () => {
  setupContentTranslationEndpoints();
  renderWithProviders(<ContentTranslationConfiguration />);
};

const uploadPath = "path:/api/ee/content-translation/upload-dictionary";

const uploadCSV = async (sizeInBytes: number) => {
  const file = new File(["a".repeat(sizeInBytes)], "file.csv", {
    type: "text/csv",
  });
  await userEvent.upload(
    screen.getByTestId("content-translation-dictionary-upload-input"),
    file,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Replace existing dictionary" }),
  );
};

describe("ContentTranslationConfiguration", () => {
  describe("rendering", () => {
    it("should render the content translation configuration section", () => {
      setup();

      expect(
        screen.getByTestId("content-translation-configuration"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Translate embedded dashboards and questions"),
      ).toBeInTheDocument();
    });

    it("should render description with CSV column requirements", () => {
      setup();

      expect(
        screen.getByText(
          /Upload a translation dictionary to translate strings both in Metabase content \(like dashboard titles\) and in the data itself \(like column names and values\)/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/The dictionary must be a CSV with these columns:/),
      ).toBeInTheDocument();
      expect(screen.getByText("Locale Code")).toBeInTheDocument();
      expect(screen.getByText("String")).toBeInTheDocument();
      expect(screen.getByText("Translation")).toBeInTheDocument();
    });

    it("should render security warning", () => {
      setup();

      expect(
        screen.getByText(
          /Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links/,
        ),
      ).toBeInTheDocument();
    });

    it("should render replacement warning", () => {
      setup();

      expect(
        screen.getByText(
          /Uploading a new dictionary will replace the existing dictionary/,
        ),
      ).toBeInTheDocument();
    });

    it("should render download and upload buttons", () => {
      setup();

      expect(
        screen.getByRole("button", {
          name: /Get translation dictionary template/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: /Upload edited translation dictionary/i,
        }),
      ).toBeInTheDocument();
    });
  });

  describe("upload size limit", () => {
    it("rejects a CSV larger than 1.5 MB without calling the upload endpoint", async () => {
      setup();

      await uploadCSV(1.6 * 1024 * 1024);

      expect(
        await screen.findByText("The file is larger than 1.5 MB"),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.called(uploadPath)).toBe(false);
    });

    it("sends a CSV within 1.5 MB to the upload endpoint", async () => {
      setup();

      await uploadCSV(1024);

      await waitFor(() =>
        expect(fetchMock.callHistory.called(uploadPath)).toBe(true),
      );
      expect(
        screen.queryByText("The file is larger than 1.5 MB"),
      ).not.toBeInTheDocument();
    });
  });
});
