import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";

import { ContentTranslationConfiguration } from "../ContentTranslationConfiguration";

const UPLOAD_DICTIONARY_PATH =
  "path:/api/ee/content-translation/upload-dictionary";

const setup = () => {
  setupContentTranslationEndpoints();
  renderWithProviders(<ContentTranslationConfiguration />);
};

const MEBIBYTE = 2 ** 20;

const createCsvFile = ({ sizeInMebibytes }: { sizeInMebibytes: number }) => {
  const header = "locale,string,translation\n";
  const row = "de,data2,data3\n";
  const rowCount = Math.floor((sizeInMebibytes * MEBIBYTE) / row.length);
  return new File([header + row.repeat(rowCount)], "file.csv", {
    type: "text/csv",
  });
};

const uploadFile = async (file: File) => {
  await userEvent.upload(
    screen.getByTestId("content-translation-dictionary-upload-input"),
    file,
  );
  const dialog = await screen.findByRole("dialog", {
    name: /upload new dictionary/i,
  });
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Replace existing dictionary" }),
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

  describe("uploading", () => {
    it("rejects a file larger than 1.5 MB without calling the upload endpoint", async () => {
      setup();

      await uploadFile(createCsvFile({ sizeInMebibytes: 1.6 }));

      await waitFor(() =>
        expect(
          screen.getAllByRole("alert").map((alert) => alert.textContent),
        ).toEqual(
          expect.arrayContaining([
            "We couldn't upload the file due to this error:",
            "The file is larger than 1.5 MB",
          ]),
        ),
      );
      expect(fetchMock.callHistory.calls(UPLOAD_DICTIONARY_PATH)).toHaveLength(
        0,
      );
    });

    it("sends a file of up to 1.5 MB to the upload endpoint", async () => {
      setup();

      await uploadFile(createCsvFile({ sizeInMebibytes: 1.4 }));

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(UPLOAD_DICTIONARY_PATH),
        ).toHaveLength(1),
      );
      expect(
        screen.queryByText(/The file is larger than/),
      ).not.toBeInTheDocument();
    });
  });
});
