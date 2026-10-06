import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

import { isObject } from "./guards";
import type { ResourceModel } from "./types";

/**
 * Where the repository holds the collections of the `data-apps` namespace: an
 * app's collection, and the saved questions and copies in it, as serialization
 * writes them. A pull reads the files by their content, not their location, so
 * the check does too: the app's files are the ones that name its collection.
 */
export const COLLECTIONS_DIR = "collections/data_apps";

const RESOURCE_MODELS: readonly ResourceModel[] = ["Card", "Action"];

export interface ResourceFile {
  /** Relative to the repository root. */
  path: string;
  model: ResourceModel;
  entity: Record<string, unknown>;
}

export interface AppResources {
  /** The repository the app lives in, which `COLLECTIONS_DIR` is under. */
  repoRoot: string;
  /** The file of the app's collection, relative to the repository root, when one holds it. */
  collectionPath?: string;
  /** The cards and actions in the app's collection. */
  files: ResourceFile[];
}

/**
 * The repository an app lives in: the directory that holds its `data_apps/`
 * directory. An app that isn't under `data_apps/` stands in for its own
 * repository, so its collection files sit under its own `collections/`.
 */
export function repoRootOf(appRoot: string) {
  const parent = path.dirname(appRoot);

  return path.basename(parent) === "data_apps" ? path.dirname(parent) : appRoot;
}

function listYamlFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listYamlFiles(entryPath);
      }

      // A pull skips hidden files, so a check that counted them could pass an
      // app whose resources never load.
      return entry.isFile() &&
        !entry.name.startsWith(".") &&
        entry.name.endsWith(".yaml")
        ? [entryPath]
        : [];
    });
}

function readEntity(repoRoot: string, filePath: string) {
  const relativePath = path.relative(repoRoot, filePath);

  try {
    const entity: unknown = parseYaml(fs.readFileSync(filePath, "utf8"));
    return { path: relativePath, entity: isObject(entity) ? entity : {} };
  } catch (error) {
    throw new Error(`Could not parse ${relativePath}: ${String(error)}`);
  }
}

/** The model a serialized entity's `serdes/meta` names, as a pull reads it. */
function modelOf(entity: Record<string, unknown>): unknown {
  const meta = entity["serdes/meta"];
  const leaf = Array.isArray(meta) ? meta[meta.length - 1] : undefined;

  return isObject(leaf) ? leaf.model : undefined;
}

const isResourceModel = (model: unknown): model is ResourceModel =>
  RESOURCE_MODELS.some((resourceModel) => resourceModel === model);

/**
 * The files of the app's collection, the one with `collectionEntityId`: the
 * collection's own file, and the cards and actions whose `collection_id` is it,
 * wherever they sit under the repository's `collections/data_apps/`.
 */
export function readResources(
  appRoot: string,
  collectionEntityId: string,
): AppResources {
  const repoRoot = repoRootOf(appRoot);
  const entities = listYamlFiles(path.join(repoRoot, COLLECTIONS_DIR)).map(
    (filePath) => readEntity(repoRoot, filePath),
  );

  const collectionPath = entities.find(
    ({ entity }) =>
      modelOf(entity) === "Collection" &&
      entity.entity_id === collectionEntityId,
  )?.path;

  const files = entities.flatMap(({ path: filePath, entity }) => {
    const model = modelOf(entity);

    return isResourceModel(model) && entity.collection_id === collectionEntityId
      ? [{ path: filePath, model, entity }]
      : [];
  });

  return { repoRoot, collectionPath, files };
}
