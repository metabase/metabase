import { renderWithProviders, waitFor } from "__support__/ui";
import { Route } from "metabase/router";

import { QuestionHashRedirect } from "./QuestionHashRedirect";

const setup = (initialRoute: string) =>
  renderWithProviders(
    <>
      <Route path="/q" element={<QuestionHashRedirect />} />
      <Route path="/card/:slug" element={<QuestionHashRedirect />} />
      <Route path="/question" element={<div>question</div>} />
      <Route path="/question/:slug" element={<div>question</div>} />
    </>,
    { withRouter: true, initialRoute },
  );

describe("QuestionHashRedirect", () => {
  it("redirects /q to /question, preserving the hash", async () => {
    const { history } = setup("/q#foo=bar");

    await waitFor(() => {
      const location = history?.getCurrentLocation();
      expect(location?.pathname).toBe("/question");
      expect(location?.hash).toBe("#foo=bar");
    });
  });

  it("redirects /card/:slug to /question/:slug, preserving the hash", async () => {
    const { history } = setup("/card/123-foo#bar=baz");

    await waitFor(() => {
      const location = history?.getCurrentLocation();
      expect(location?.pathname).toBe("/question/123-foo");
      expect(location?.hash).toBe("#bar=baz");
    });
  });
});
