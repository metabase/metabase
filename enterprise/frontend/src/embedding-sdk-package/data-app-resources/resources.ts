import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

import { isObject } from "./guards";
import type { ResourceModel } from "./types";

export const RESOURCES_DIR = "resources";

export const MODEL_DIRS: Record<ResourceModel, string> = {
  Card: "cards",
  Action: "actions",
};

const RESOURCE_MODELS: readonly ResourceModel[] = ["Card", "Action"];

export interface ResourceFile {
  /** Relative to the app's `resources/` directory. */
  path: string;
  model: ResourceModel;
  entity: Record<string, unknown>;
}

function listYamlFiles(directory: string) {
  return fs.existsSync(directory)
    ? fs
        .readdirSync(directory, { withFileTypes: true })
        // A pull skips hidden files, so a check that counted them could pass an
        // app whose resources never load.
        .filter(
          (entry) =>
            entry.isFile() &&
            !entry.name.startsWith(".") &&
            entry.name.endsWith(".yaml"),
        )
        .map((entry) => entry.name)
        .sort()
    : [];
}

function readResourceFile(appRoot: string, filePath: string) {
  try {
    return parseYaml(
      fs.readFileSync(path.join(appRoot, RESOURCES_DIR, filePath), "utf8"),
    );
  } catch (error) {
    throw new Error(
      `Could not parse ${RESOURCES_DIR}/${filePath}: ${String(error)}`,
    );
  }
}

/** The app's committed saved question and action files. */
export function readResources(appRoot: string): ResourceFile[] {
  return RESOURCE_MODELS.flatMap((model) =>
    listYamlFiles(path.join(appRoot, RESOURCES_DIR, MODEL_DIRS[model])).map(
      (name) => {
        const filePath = `${MODEL_DIRS[model]}/${name}`;
        const entity = readResourceFile(appRoot, filePath);
        return {
          path: filePath,
          model,
          entity: isObject(entity) ? entity : {},
        };
      },
    ),
  );
}
