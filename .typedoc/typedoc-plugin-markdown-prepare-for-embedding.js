import { MarkdownPageEvent } from "typedoc-plugin-markdown";

const lineSeparatorRegExp = /\r?\n/;
const markdownHeadingRegExp = /^(#+)\s*(.+)$/;

const getSnippetStartComment = (snippetName) =>
  `<!-- [<snippet ${snippetName}>] -->`;
const getSnippetEndComment = (snippetName) =>
  `<!-- [<endsnippet ${snippetName}>] -->`;

const convertSectionNameToSnippetName = (sectionName) =>
  sectionName.trim().toLowerCase().replace(/\s+/g, "-");

/**
 * A typedoc plugin that prepares `.md` files for embedding
 * - it wraps content of all sections into `jekyll_include_plugin` snippet comments,
 *   so such snippets can be included into other `.md` files.
 *   See: https://github.com/flant/jekyll_include_plugin/tree/master
 */
export function load(app) {
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    const isMarkdownPage = page.url.endsWith(".md");
    const isIndexFile = page.url.endsWith("index.md");

    if (!isMarkdownPage || isIndexFile) {
      return;
    }

    const lines = page.contents.split(lineSeparatorRegExp);
    const output = [];
    let currentSnippet = "";

    for (const line of lines) {
      const match = line.match(markdownHeadingRegExp);

      if (!match) {
        output.push(line);

        continue;
      }

      if (currentSnippet) {
        output.push(getSnippetEndComment(currentSnippet));
        currentSnippet = "";
      }

      output.push(line);

      currentSnippet = convertSectionNameToSnippetName(match[2]);
      output.push(getSnippetStartComment(currentSnippet));
    }

    if (currentSnippet) {
      output.push(getSnippetEndComment(currentSnippet));
    }

    page.contents = output.join("\n");
  });
}
