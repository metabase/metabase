import type { Editor } from "@tiptap/react";

export const createMockEditor = (overrides: Partial<Editor> = {}): Editor =>
  ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    commands: {
      focus: jest.fn(),
      insertContentAt: jest.fn(),
      exitCode: jest.fn(),
      command: jest.fn(),
    },
    state: {
      selection: { $from: {}, empty: true },
      doc: { nodeAt: jest.fn(), resolve: jest.fn() },
    },
    options: {
      editable: true,
      ...overrides.options,
    },
    ...overrides,
  }) as unknown as Editor;
