import { ACTION_DEFINITIONS, injectGeneratedId } from "./ast/query-source";
import { getPayloadFingerprint } from "./canonical";
import { isPositiveInteger } from "./guards";
import { writeResourceLockfile } from "./lockfile";
import { getErrorMessage, getRelativeDefinitionLocation } from "./messages";
import type { MetabaseClient } from "./metabase-client";
import { orNullOn404 } from "./metabase-client";
import type {
  ActionLockEntry,
  DiscoveredAction,
  MetabaseAction,
  ResourceLockfile,
} from "./types";

export interface ReconcileActionsOptions {
  appRoot: string;
  slug: string;
  collectionId: number;
  actions: DiscoveredAction[];
  lockfile: ResourceLockfile;
  client: MetabaseClient;
  log: (message: string) => void;
}

interface ResolvedAction {
  action: DiscoveredAction;
  source: MetabaseAction;
}

function pickDefined(source: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
}

/** Also the fingerprint input, so drift is measured over exactly what gets copied. */
function actionCopyFields(source: MetabaseAction) {
  return pickDefined({
    name: source.name,
    type: source.type,
    description: source.description,
    visualization_settings: source.visualization_settings,
    parameters: source.parameters,
    parameter_mappings: source.parameter_mappings,
    dataset_query: source.dataset_query,
    database_id: source.database_id,
  });
}

async function resolveActions(
  appRoot: string,
  actions: DiscoveredAction[],
  client: MetabaseClient,
): Promise<ResolvedAction[]> {
  return Promise.all(
    actions.map(async (action) => {
      const location = getRelativeDefinitionLocation(appRoot, action);
      let source: MetabaseAction;
      try {
        // `GET /api/action/:id` filters archived actions out, so an archived
        // source surfaces here as a 404 rather than a readable payload.
        source = await client.getAction(action.sourceActionId);
      } catch (error) {
        throw new Error(
          `Could not read action ${action.sourceActionId} for ${location}: ${getErrorMessage(error)}`,
        );
      }

      if (isPositiveInteger(source.model_id) || source.type !== "query") {
        throw new Error(
          `${location} references action ${action.sourceActionId}, which is not a query action without a model. A data app runs only query actions that belong to no model.`,
        );
      }

      return { action, source };
    }),
  );
}

function assertOwnedActionCopy(
  copy: MetabaseAction,
  sourceActionId: number,
  collectionId: number,
) {
  if (isPositiveInteger(copy.model_id) || copy.collection_id !== collectionId) {
    throw new Error(
      `Action ${copy.id} is the copy of action ${sourceActionId} but is no longer in data app collection ${collectionId}, so it was left untouched. Move it back or delete it manually, then run sync-resources again.`,
    );
  }
}

async function reconcileAction(
  { appRoot, collectionId, client, lockfile, log }: ReconcileActionsOptions,
  { action, source }: ResolvedAction,
) {
  const fields = actionCopyFields(source);
  const hash = getPayloadFingerprint(fields);
  let mapping: ActionLockEntry | undefined = lockfile.actions.find(
    ({ sourceActionId }) => sourceActionId === source.id,
  );
  const copy = mapping
    ? await orNullOn404(client.getAction(mapping.copiedActionId))
    : null;

  if (mapping && copy) {
    assertOwnedActionCopy(copy, source.id, collectionId);
  }

  if (mapping && !copy) {
    lockfile.actions.splice(lockfile.actions.indexOf(mapping), 1);
    mapping = undefined;
  }

  if (!mapping || !copy) {
    const created = await client.createAction({
      ...fields,
      collection_id: collectionId,
    });

    if (!isPositiveInteger(created.id)) {
      throw new Error("The Action API did not return a valid action ID.");
    }

    lockfile.actions.push({
      sourceActionId: source.id,
      copiedActionId: created.id,
      hash,
    });

    injectGeneratedId(action, ACTION_DEFINITIONS, created.id);
    writeResourceLockfile(appRoot, lockfile);
    log(`copied action: action ${source.id} -> action ${created.id}`);

    return;
  }

  // Fingerprint the copy rather than trusting the lockfile: that also catches
  // a copy edited directly in Metabase, which the source hash cannot see.
  if (getPayloadFingerprint(actionCopyFields(copy)) !== hash) {
    await client.updateAction(mapping.copiedActionId, fields);
    mapping.hash = hash;
    writeResourceLockfile(appRoot, lockfile);
    log(`updated action: action ${mapping.copiedActionId}`);
  }

  if (action.copiedActionId !== mapping.copiedActionId) {
    injectGeneratedId(action, ACTION_DEFINITIONS, mapping.copiedActionId);
    log(
      `restored action ID: ${action.exportName} -> action ${mapping.copiedActionId}`,
    );
  }
}

async function removeUnusedActions(
  { appRoot, collectionId, client, lockfile, log }: ReconcileActionsOptions,
  desiredIds: Set<number>,
) {
  for (const mapping of [...lockfile.actions]) {
    if (desiredIds.has(mapping.sourceActionId)) {
      continue;
    }

    const copy = await orNullOn404(client.getAction(mapping.copiedActionId));

    if (copy) {
      assertOwnedActionCopy(copy, mapping.sourceActionId, collectionId);
      await client.deleteAction(mapping.copiedActionId);
      log(`deleted action: action ${mapping.copiedActionId}`);
    }

    lockfile.actions.splice(lockfile.actions.indexOf(mapping), 1);
    writeResourceLockfile(appRoot, lockfile);
  }
}

/**
 * Makes the data app collection hold a copy of exactly the actions the app
 * declares, copying an action when its declaration appears and deleting the
 * copy when the declaration goes away. Returns the tables those actions read.
 */
export async function reconcileActions(options: ReconcileActionsOptions) {
  const { appRoot, slug, actions, client } = options;
  const resolved = await resolveActions(appRoot, actions, client);

  for (const entry of resolved) {
    await reconcileAction(options, entry);
  }

  await removeUnusedActions(
    options,
    new Set(resolved.map(({ source }) => source.id)),
  );

  return client.resolveTableDependencies(
    slug,
    resolved.flatMap(({ source }) =>
      source.dataset_query ? [source.dataset_query] : [],
    ),
  );
}
