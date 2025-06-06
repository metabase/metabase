import fs from "fs";

import { SourceMapConsumer, SourceMapGenerator } from "source-map";

import { SOURCE_MAPS_ENABLED } from "../constants/source-maps-enabled.mjs";

export async function updateChunkContentAndSourceMap(filePath, updateContent) {
  const content = fs.readFileSync(filePath, "utf8");
  const updatedContent = updateContent(content);

  fs.writeFileSync(filePath, updatedContent, "utf8");

  if (!SOURCE_MAPS_ENABLED) {
    return;
  }

  const mapFilePath = `${filePath}.map`;
  const rawMap = JSON.parse(fs.readFileSync(mapFilePath, "utf8"));

  const originalLineCount = content.split("\n").length;
  const newLineCount = updatedContent.split("\n").length;
  const lineDelta = newLineCount - originalLineCount;

  const oldMapConsumer = await new SourceMapConsumer(rawMap);
  const newMapGen = new SourceMapGenerator({
    file: rawMap.file,
    sourceRoot: rawMap.sourceRoot,
  });

  oldMapConsumer.eachMapping((mappingItem) => {
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

  oldMapConsumer.sources.forEach((source) => {
    const content = oldMapConsumer.sourceContentFor(source, true);

    if (content != null) {
      newMapGen.setSourceContent(source, content);
    }
  });

  oldMapConsumer.destroy();

  fs.writeFileSync(mapFilePath, newMapGen.toString(), "utf8");
}
