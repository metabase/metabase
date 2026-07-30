import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings at the right level", () => {
    expect(renderMarkdown("## Bug fixes")).toBe("<h2>Bug fixes</h2>");
    expect(renderMarkdown("#### Deep")).toBe("<h4>Deep</h4>");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two");
    expect(html).toBe("<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
  });

  it("renders bold, italic and inline code", () => {
    expect(renderMarkdown("**Querying**")).toBe("<p><strong>Querying</strong></p>");
    expect(renderMarkdown("a `code` span")).toBe("<p>a <code>code</code> span</p>");
    expect(renderMarkdown("some _emphasis_ here")).toBe("<p>some <em>emphasis</em> here</p>");
  });

  it("renders safe links and opens them in a new tab", () => {
    const html = renderMarkdown("see [#123](https://github.com/metabase/metabase/issues/123)");
    expect(html).toContain(
      '<a href="https://github.com/metabase/metabase/issues/123" target="_blank" rel="noopener noreferrer">#123</a>',
    );
  });

  it("groups consecutive text lines into a paragraph and splits on blank lines", () => {
    const html = renderMarkdown("line one\nline two\n\nsecond para");
    expect(html).toBe("<p>line one line two</p>\n<p>second para</p>");
  });

  it("escapes HTML to prevent injection from model-generated summaries", () => {
    const html = renderMarkdown('Watch out <script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not turn a javascript: link into an anchor", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).toContain("[click]");
  });

  it("renders a horizontal rule", () => {
    expect(renderMarkdown("---")).toBe("<hr />");
  });
});
