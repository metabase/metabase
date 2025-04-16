import glob from "glob";
import typedocConfig from "./typedoc.config.mjs";
import fs from "fs";

/**
 * Removes some markdown documentation files that can't be embedded
 */
const cleanupNonEmbeddableMarkdownFiles = () => {
  const markdownDocsOutputDir =
    typedocConfig.outputs.find((output) => output.name === "markdown")?.path ??
    "";
  const internalModuleName = typedocConfig.internalModule;

  const markdownFiles = glob.sync(
    `${import.meta.dirname}/${markdownDocsOutputDir}/**/*.md`,
  );

  markdownFiles.forEach((filePath) => {
    const fileContent = fs.readFileSync(filePath, "utf8");

    const isIndexFile = filePath.endsWith("index.md");
    const isInternalFile = filePath.includes(`/${internalModuleName}/`);
    const isEmptyFile = fileContent.trim() === "";

    const shouldRemove = isIndexFile || isInternalFile || isEmptyFile;

    if (shouldRemove) {
      fs.unlinkSync(filePath);
    }
  });
};

cleanupNonEmbeddableMarkdownFiles();
