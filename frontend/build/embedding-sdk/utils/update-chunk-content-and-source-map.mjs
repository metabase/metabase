import fs from "fs";

import { SourceMapConsumer, SourceMapGenerator } from "source-map";

import { ENABLE_SOURCE_MAPS } from "../constants/source-maps-enabled.mjs";

export async function updateChunkContentAndSourceMap(filePath, updateContent) {
  const content = fs.readFileSync(filePath, "utf8");
  const { content: updatedContent, sourceMap: updatedSourceMap = null } =
    await updateContent(content);

  fs.writeFileSync(filePath, updatedContent, "utf8");

  if (!ENABLE_SOURCE_MAPS) {
    return;
  }

  const mapFilePath = `${filePath}.map`;

  if (updatedSourceMap) {
    fs.writeFileSync(mapFilePath, JSON.stringify(updatedSourceMap), "utf8");

    return;
  }

  const rawMap = JSON.parse(fs.readFileSync(mapFilePath, "utf8"));

  const originalLineCount = content.split("\n").length;
  const newLineCount = updatedContent.split("\n").length;
  const lineDelta = newLineCount - originalLineCount;

  const originalConsumer = await new SourceMapConsumer(rawMap);
  const newMapGen = new SourceMapGenerator({
    file: rawMap.file,
    sourceRoot: rawMap.sourceRoot,
  });

  originalConsumer.eachMapping((mappingItem) => {
    const generatedLine = mappingItem.generatedLine + lineDelta;
    const generatedColumn = mappingItem.generatedColumn;

    newMapGen.addMapping({
      generated: { line: generatedLine, column: generatedColumn },
      original:
        mappingItem.originalLine == null
          ? null
          : {
              line: mappingItem.originalLine,
              column: mappingItem.originalColumn,
            },
      source: mappingItem.source,
      name: mappingItem.name,
    });
  });

  originalConsumer.sources.forEach((source) => {
    const content = originalConsumer.sourceContentFor(source, true);

    if (content != null) {
      newMapGen.setSourceContent(source, content);
    }
  });

  originalConsumer.destroy();

  fs.writeFileSync(mapFilePath, newMapGen.toString(), "utf8");
}
