import { renderWithProviders, screen } from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import { useMantineTheme } from "metabase/ui";

import { AppThemeProvider } from "./AppThemeProvider";

type SetupOpts = {
  href: string;
  isPublicEmbedding?: boolean;
};

function PublicHeading() {
  const theme = useMantineTheme();
  return (
    <h1 style={{ color: theme.fn.themeColor("text-primary") }}>
      Public content
    </h1>
  );
}

function setup({ href, isPublicEmbedding = true }: SetupOpts) {
  jest
    .spyOn(embeddingConfig, "isPublicEmbedding")
    .mockReturnValue(isPublicEmbedding);
  window.history.replaceState({}, "", href);

  renderWithProviders(
    <AppThemeProvider>
      <PublicHeading />
    </AppThemeProvider>,
  );
}

const DARK_TEXT_COLOR = "rgba(255, 255, 255, 0.95)";

function getHeading() {
  return screen.getByRole("heading", { name: "Public content" });
}

describe("AppThemeProvider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  describe("#theme hash parameter on public links", () => {
    it.each([
      "/public/dashboard/00000000-0000-4000-8000-000000000000",
      "/public/question/00000000-0000-4000-8000-000000000000",
    ])(
      "should use the dark color scheme for #theme=dark on %s (metabase#65731)",
      (path) => {
        setup({ href: `${path}#theme=dark` });

        expect(getHeading()).toHaveStyle({ color: DARK_TEXT_COLOR });
      },
    );

    it("should use the light color scheme for #theme=light", () => {
      setup({
        href: "/public/dashboard/00000000-0000-4000-8000-000000000000#theme=light",
      });

      expect(getHeading()).not.toHaveStyle({ color: DARK_TEXT_COLOR });
    });

    it("should ignore #theme=dark outside of public and static embeds", () => {
      setup({ href: "/dashboard/1#theme=dark", isPublicEmbedding: false });

      expect(getHeading()).not.toHaveStyle({ color: DARK_TEXT_COLOR });
    });
  });
});
