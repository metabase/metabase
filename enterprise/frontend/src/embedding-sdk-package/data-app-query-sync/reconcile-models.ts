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
  MetabaseCard,
  ModelLockEntry,
  ResourceLockfile,
} from "./types";

export interface ReconcileModelsOptions {
  appRoot: string;
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

interface ModelContext {
  appRoot: string;
  collectionId: number;
  client: MetabaseClient;
  lockfile: ResourceLockfile;
  log: (message: string) => void;
}

function pickDefined(source: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
}

/** Also the fingerprint input, so drift is measured over exactly what gets copied. */
function modelCopyInput(source: MetabaseCard) {
  return {
    name: source.name,
    datasetQuery: source.dataset_query,
    display: source.display ?? "table",
    visualizationSettings: source.visualization_settings ?? {},
    description: source.description ?? null,
  };
}

/**
 * Implicit actions omit `parameters` and `parameter_mappings`: Metabase derives
 * those from the model's fields on every read.
 */
function actionCopyFields(source: MetabaseAction) {
  const common = {
    name: source.name,
    type: source.type,
    description: source.description,
    visualization_settings: source.visualization_settings,
  };

  if (source.type === "implicit") {
    return pickDefined({ ...common, kind: source.kind });
  }

  if (source.type === "query") {
    return pickDefined({
      ...common,
      parameters: source.parameters,
      parameter_mappings: source.parameter_mappings,
      dataset_query: source.dataset_query,
      database_id: source.database_id,
    });
  }
  return pickDefined(common);
}

async function resolveActions(
  appRoot: string,
  actions: DiscoveredAction[],
  client: MetabaseClient,
): Promise<ResolvedAction[]> {
  return Promise.all(
    actions.map(async (action) => {
      let source: MetabaseAction;
      try {
        // `GET /api/action/:id` filters archived actions out, so an archived
        // source surfaces here as a 404 rather than a readable payload.
        source = await client.getAction(action.sourceActionId);
      } catch (error) {
        throw new Error(
          `Could not read action ${action.sourceActionId} for ${getRelativeDefinitionLocation(appRoot, action)}: ${getErrorMessage(error)}`,
        );
      }

      if (!isPositiveInteger(source.model_id)) {
        throw new Error(
          `${getRelativeDefinitionLocation(appRoot, action)} references action ${action.sourceActionId}, which does not belong to a model.`,
        );
      }

      return { action, source };
    }),
  );
}

async function fetchSourceModels(
  appRoot: string,
  desired: Map<number, ResolvedAction[]>,
  client: MetabaseClient,
): Promise<Map<number, MetabaseCard>> {
  const models = await Promise.all(
    [...desired].map(async ([id, actions]) => {
      const location = getRelativeDefinitionLocation(
        appRoot,
        actions[0].action,
      );

      let card: MetabaseCard;
      try {
        card = await client.getCard(id);
      } catch (error) {
        throw new Error(
          `Could not read model ${id} for ${location}: ${getErrorMessage(error)}`,
        );
      }

      if (card.type !== "model") {
        throw new Error(
          `${location} references an action on card ${id}, which is not a model.`,
        );
      }

      // A trashed action reads as a 404 and stops the run; a trashed model is
      // still readable, so refuse it here rather than copying from something
      // its author deleted.
      if (card.archived === true) {
        throw new Error(
          `${location} references an action on model ${id}, which is in the trash. Restore the model or remove the declaration, then run sync-resources again.`,
        );
      }

      return [id, card] as const;
    }),
  );

  return new Map(models);
}

function assertOwnedActionCopy(
  action: MetabaseAction,
  sourceActionId: number,
  copiedModelId: number,
) {
  if (action.model_id !== copiedModelId) {
    throw new Error(
      `Action ${action.id} is the copy of action ${sourceActionId} but no longer hangs off copied model ${copiedModelId}, so it was left untouched. Move it back or delete it manually, then run sync-resources again.`,
    );
  }
}

function assertOwnedModelCopy(card: MetabaseCard, collectionId: number) {
  if (card.type !== "model") {
    throw new Error(
      `Card ${card.id} belongs to a synchronized model but is no longer a model, so it was left untouched. Change it back to a model in data app collection ${collectionId} or delete it manually, then run sync-resources again.`,
    );
  }

  // A trashed copy reports the Trash as its collection, so its real one says
  // nothing here. Only the restore path reaches this with one, and it puts both
  // the card and its collection back.
  if (card.archived !== true && card.collection_id !== collectionId) {
    throw new Error(
      `Card ${card.id} belongs to a synchronized model but is no longer in the data app collection, so it was left untouched. Move card ${card.id} back to data app collection ${collectionId} or delete it manually, then run sync-resources again.`,
    );
  }
}

async function reconcileModelActions(
  context: ModelContext,
  entry: ModelLockEntry,
  desiredActions: ResolvedAction[],
) {
  const { appRoot, client, lockfile, log } = context;
  const desiredIds = new Set(desiredActions.map(({ source }) => source.id));

  for (const { action, source } of desiredActions) {
    const fields = actionCopyFields(source);
    const hash = getPayloadFingerprint(fields);
    let mapping: ActionLockEntry | undefined = entry.actions.find(
      ({ sourceActionId }) => sourceActionId === source.id,
    );
    const copiedAction = mapping
      ? await orNullOn404(client.getAction(mapping.copiedActionId))
      : null;

    if (mapping && copiedAction) {
      assertOwnedActionCopy(copiedAction, source.id, entry.copiedModelId);
    }

    if (mapping && !copiedAction) {
      entry.actions.splice(entry.actions.indexOf(mapping), 1);
      mapping = undefined;
    }

    if (!mapping || !copiedAction) {
      const created = await client.createAction({
        ...fields,
        model_id: entry.copiedModelId,
      });

      if (!isPositiveInteger(created.id)) {
        throw new Error("The Action API did not return a valid action ID.");
      }

      entry.actions.push({
        sourceActionId: source.id,
        copiedActionId: created.id,
        hash,
      });

      injectGeneratedId(action, ACTION_DEFINITIONS, created.id);
      writeResourceLockfile(appRoot, lockfile);
      log(`copied action: action ${source.id} -> action ${created.id}`);

      continue;
    }

    // Fingerprint the copy rather than trusting the lockfile: that also catches
    // a copy edited directly in Metabase, which the source hash cannot see.
    if (getPayloadFingerprint(actionCopyFields(copiedAction)) !== hash) {
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

  for (const mapping of [...entry.actions]) {
    if (desiredIds.has(mapping.sourceActionId)) {
      continue;
    }

    const copiedAction = await orNullOn404(
      client.getAction(mapping.copiedActionId),
    );

    if (copiedAction && copiedAction.model_id !== entry.copiedModelId) {
      throw new Error(
        `Action ${mapping.copiedActionId} belongs to a removed declaration but no longer hangs off copied model ${entry.copiedModelId}, so it was left untouched. Move it back or delete it manually, then run sync-resources again.`,
      );
    }

    if (copiedAction) {
      await client.deleteAction(mapping.copiedActionId);
      log(`deleted action: action ${mapping.copiedActionId}`);
    }

    entry.actions.splice(entry.actions.indexOf(mapping), 1);
    writeResourceLockfile(appRoot, lockfile);
  }
}

async function reconcileModel(
  context: ModelContext,
  sourceModel: MetabaseCard,
  desiredActions: ResolvedAction[],
) {
  const { appRoot, collectionId, client, lockfile, log } = context;
  const hash = getPayloadFingerprint(modelCopyInput(sourceModel));
  const index = lockfile.models.findIndex(
    ({ sourceModelId }) => sourceModelId === sourceModel.id,
  );
  const previous = index >= 0 ? lockfile.models[index] : undefined;
  const copy = previous
    ? await orNullOn404(client.getCard(previous.copiedModelId))
    : null;

  if (previous && copy) {
    assertOwnedModelCopy(copy, collectionId);

    // `archived` is deliberately not part of the fingerprint: it describes the
    // copy's state, not the payload, and folding it in would invalidate every
    // lockfile written before this.
    if (
      copy.archived === true ||
      getPayloadFingerprint(modelCopyInput(copy)) !== hash
    ) {
      await client.updateModel(previous.copiedModelId, {
        ...modelCopyInput(sourceModel),
        collectionId,
      });
      previous.hash = hash;
      writeResourceLockfile(appRoot, lockfile);
      log(`updated model: card ${previous.copiedModelId}`);
    }

    await reconcileModelActions(context, previous, desiredActions);

    return;
  }

  if (previous) {
    lockfile.models.splice(index, 1);
  }

  const created = await client.createModel({
    ...modelCopyInput(sourceModel),
    collectionId,
  });

  if (!isPositiveInteger(created.id)) {
    throw new Error("The Card API did not return a valid model ID.");
  }

  const entry: ModelLockEntry = {
    sourceModelId: sourceModel.id,
    copiedModelId: created.id,
    hash,
    actions: [],
  };

  lockfile.models.push(entry);

  writeResourceLockfile(appRoot, lockfile);
  log(
    previous
      ? `recreated model: card ${previous.copiedModelId} -> card ${created.id}`
      : `copied model: model ${sourceModel.id} -> card ${created.id}`,
  );

  await reconcileModelActions(context, entry, desiredActions);
}

async function removeUnusedModels(
  context: ModelContext,
  previousModels: ModelLockEntry[],
  desiredModelIds: Set<number>,
) {
  const { appRoot, collectionId, client, lockfile, log } = context;
  for (const entry of previousModels) {
    if (desiredModelIds.has(entry.sourceModelId)) {
      continue;
    }

    const index = lockfile.models.findIndex(
      ({ sourceModelId }) => sourceModelId === entry.sourceModelId,
    );

    if (index < 0) {
      continue;
    }

    const copy = await orNullOn404(client.getCard(entry.copiedModelId));

    if (copy?.archived === true) {
      // The trash masks a card's collection, so this reads the same as a copy
      // moved out and trashed afterwards. Deleting is permanent, and the card is
      // already where someone put it to be deleted.
      log(`left in the trash: card ${copy.id}`);
    } else if (copy) {
      assertOwnedModelCopy(copy, collectionId);
      // Deleting the copy cascades to the actions copied onto it.
      await client.deleteCard(copy.id);
      log(`deleted model: card ${copy.id}`);
    }

    lockfile.models.splice(index, 1);

    writeResourceLockfile(appRoot, lockfile);
  }
}

/**
 * Makes the data app collection hold exactly the models its actions belong to,
 * copying a model when its first action appears and deleting it when its last
 * action goes away.
 */
export async function reconcileModels({
  appRoot,
  collectionId,
  actions,
  lockfile,
  client,
  log,
}: ReconcileModelsOptions) {
  const previousModels = [...lockfile.models];
  const resolved = await resolveActions(appRoot, actions, client);

  const desired = new Map<number, ResolvedAction[]>();

  for (const entry of resolved) {
    desired.set(entry.source.model_id, [
      ...(desired.get(entry.source.model_id) ?? []),
      entry,
    ]);
  }

  const sourceModels = await fetchSourceModels(appRoot, desired, client);
  const context: ModelContext = {
    appRoot,
    collectionId,
    client,
    lockfile,
    log,
  };

  for (const [sourceModelId, desiredActions] of desired) {
    const sourceModel = sourceModels.get(sourceModelId);
    if (sourceModel) {
      await reconcileModel(context, sourceModel, desiredActions);
    }
  }

  await removeUnusedModels(context, previousModels, new Set(desired.keys()));
}
