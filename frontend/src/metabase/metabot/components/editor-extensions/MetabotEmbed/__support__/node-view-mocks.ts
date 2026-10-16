import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { DecorationSource, EditorView } from "@tiptap/pm/view";
import type { Extension, NodeViewProps } from "@tiptap/react";

import { createMockEditor } from "./editor-mocks";

export const createMockProseMirrorNode = (overrides = {}): ProseMirrorNode =>
  // Unjustified type cast. FIXME
  ({
    textContent: "",
    content: { content: [] },
    type: { name: "metabot" },
    attrs: {},
    marks: [],
    nodeSize: 1,
    childCount: 0,
    ...overrides,
  }) as unknown as ProseMirrorNode;

export const createMockExtension = (overrides = {}): Extension =>
  // Unjustified type cast. FIXME
  ({
    name: "my-extension",
    options: {},
    ...overrides,
  }) as unknown as Extension;

export const createMockNodeViewProps = (overrides = {}): NodeViewProps =>
  // Unjustified type cast. FIXME
  ({
    editor: createMockEditor(),
    node: createMockProseMirrorNode(),
    getPos: () => 0,
    deleteNode: jest.fn(),
    updateAttributes: jest.fn(),
    decorations: [],
    selected: false,
    // Unjustified type cast. FIXME
    view: {} as unknown as EditorView,
    // Unjustified type cast. FIXME
    innerDecorations: {} as unknown as DecorationSource,
    HTMLAttributes: {},
    extension: createMockExtension(),
    ...overrides,
  }) as NodeViewProps;
