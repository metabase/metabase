import { render, screen } from "__support__/ui";
import { Markdown } from "metabase/common/components/Markdown";

import { hideUnnecessaryElements } from "./markdown-utils";

describe("EmbeddedEngineDocContent/utils", () => {
  describe("hideUnnecessaryElements", () => {
    it("should hide h1 and elements immediately below it", () => {
      const testMDContent =
        "# This is an H1 element \n\n" +
        "This is some text after the H1 element \n\n" +
        "> This is a blockquote after the H1 element\n\n" +
        "## This is an H2 element\n\n" +
        "This is some text after the H2 element\n\n" +
        "{% This is a template include %}\n\n" +
        "This is some text after the template include";

      const { container } = render(
        <Markdown data-testid="markdown">{testMDContent}</Markdown>,
      );
      hideUnnecessaryElements(container);
      expect(screen.getByText(/This is an H1 element/)).not.toBeVisible();
      expect(
        screen.getByText(/This is some text after the H1 element/),
      ).not.toBeVisible();
      expect(
        screen.getByText(/This is a blockquote after the H1 element/),
      ).not.toBeVisible();
      expect(screen.getByText(/This is a template include/)).not.toBeVisible();

      // Other elements should be visible
      expect(screen.getByText(/This is an H2 element/)).toBeVisible();
      expect(
        screen.getByText(/This is some text after the H2 element/),
      ).toBeVisible();
      expect(
        screen.getByText(/This is some text after the template include/),
      ).toBeVisible();
    });
  });
});
