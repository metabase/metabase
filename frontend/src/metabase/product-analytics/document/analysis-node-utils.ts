import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import _ from "underscore";

import { ID_ATTRIBUTE_NAME } from "metabase/rich_text_editing/tiptap/extensions/NodeIds";
import { uuid } from "metabase/utils/uuid";
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";
import { getProductAnalyticsNodeDefinition } from "metabase-types/guards";

import type { CommonSettings } from "../analyses/types";
import { updateSettings } from "../settings/compute";
import type { StoredSettings } from "../settings/types";

export const ANALYSIS_NODE_TYPE = "productAnalysis";

/** Settings the document holds for every analysis, so nodes never store them. */
const DOCUMENT_SETTING_KEYS = [
  "date_range",
] as const satisfies readonly (keyof CommonSettings)[];

type FoundAnalysisNode = {
  node: ProseMirrorNode;
  pos: number;
  definition: ProductAnalyticsNodeDefinition | undefined;
};

export const getAnalysisNodeId = (
  node: ProseMirrorNode,
): string | undefined => {
  const id: unknown = node.attrs[ID_ATTRIBUTE_NAME];
  return typeof id === "string" ? id : undefined;
};

export const findAnalysisNode = (
  doc: ProseMirrorNode,
  nodeId: string,
): FoundAnalysisNode | undefined => {
  let found: FoundAnalysisNode | undefined;
  doc.descendants((node, pos) => {
    if (found !== undefined) {
      return false;
    }
    if (
      node.type.name === ANALYSIS_NODE_TYPE &&
      getAnalysisNodeId(node) === nodeId
    ) {
      found = {
        node,
        pos,
        definition: getProductAnalyticsNodeDefinition(node.attrs.definition),
      };
      return false;
    }
    return true;
  });
  return found;
};

export const createAnalysisNodeContent = (
  definition: ProductAnalyticsNodeDefinition,
  nodeId: string = uuid(),
): JSONContent => ({
  type: ANALYSIS_NODE_TYPE,
  attrs: { [ID_ATTRIBUTE_NAME]: nodeId, definition },
});

export const withoutDocumentSettings = (
  settings: StoredSettings,
): StoredSettings => _.omit(settings, ...DOCUMENT_SETTING_KEYS);

/**
 * Merges `changes` into the node's stored settings in one undoable step.
 * Settings the document holds are dropped. Does nothing when the node is gone.
 */
export const updateAnalysisNodeSettings = (
  editor: Editor,
  nodeId: string,
  changes: StoredSettings,
) => {
  const found = findAnalysisNode(editor.state.doc, nodeId);
  if (found?.definition === undefined) {
    return;
  }
  const settings = withoutDocumentSettings(
    updateSettings(found.definition.settings, changes),
  );
  if (_.isEqual(settings, found.definition.settings)) {
    return;
  }
  const definition: ProductAnalyticsNodeDefinition = {
    ...found.definition,
    settings,
  };
  editor.view.dispatch(
    editor.state.tr.setNodeAttribute(found.pos, "definition", definition),
  );
};

/**
 * Inserts an analysis right after the node `afterNodeId`, or at the end of the
 * document when that node is gone. Returns the new node's id.
 */
export const insertAnalysisNodeAfter = (
  editor: Editor,
  afterNodeId: string,
  definition: ProductAnalyticsNodeDefinition,
): string => {
  const nodeId = uuid();
  const found = findAnalysisNode(editor.state.doc, afterNodeId);
  const pos =
    found !== undefined
      ? found.pos + found.node.nodeSize
      : editor.state.doc.content.size;
  editor
    .chain()
    .insertContentAt(pos, createAnalysisNodeContent(definition, nodeId))
    .run();
  return nodeId;
};

/**
 * Inserts an analysis at the cursor, replacing the paragraph there if it's
 * empty. A selected node, like another analysis, is kept: the new one goes
 * after it. Returns the new node's id.
 */
export const insertAnalysisNodeAtSelection = (
  editor: Editor,
  definition: ProductAnalyticsNodeDefinition,
): string => {
  const nodeId = uuid();
  const content = createAnalysisNodeContent(definition, nodeId);
  const { selection } = editor.state;
  const chain = editor.chain().focus();
  if (selection instanceof NodeSelection) {
    chain.insertContentAt(selection.to, content);
  } else {
    chain.insertContent(content);
  }
  chain.run();
  return nodeId;
};
