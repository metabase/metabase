import { renderWithProviders, screen } from "__support__/ui";

import { ContentTranslationConfiguration } from "../ContentTranslationConfiguration";

const setup = () => {
  renderWithProviders(<ContentTranslationConfiguration />);
};

describe("ContentTranslationConfiguration", () => {
  describe("rendering", () => {
    it("should render the content translation configuration section", () => {
      setup();

      expect(
        screen.getByTestId("content-translation-configuration"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Upload a dictionary to translate user-generated content",
        ),
      ).toBeInTheDocument();
    });

    it("should render description with CSV column requirements", () => {
      setup();

      expect(
        screen.getByText(
          "You can upload a translation dictionary to handle user-generated strings, like dashboard names.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("The dictionary must be a CSV with these columns:"),
      ).toBeInTheDocument();
      expect(screen.getByText("Locale Code")).toBeInTheDocument();
      expect(screen.getByText("String")).toBeInTheDocument();
      expect(screen.getByText("Translation")).toBeInTheDocument();
    });

    it("should render security warning", () => {
      setup();

      expect(
        screen.getByText(
          "Don't put any sensitive data in the dictionary, since anyone can see the dictionary—including viewers of public links.",
        ),
      ).toBeInTheDocument();
    });

    it("should render replacement warning", () => {
      setup();

      expect(
        screen.getByText(
          "Uploading a new dictionary will replace the existing dictionary.",
        ),
      ).toBeInTheDocument();
    });

    it("should render download and upload buttons", () => {
      setup();

      expect(
        screen.getByRole("button", {
          name: /Download translation dictionary/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upload translation dictionary/i }),
      ).toBeInTheDocument();
    });
  });
});
