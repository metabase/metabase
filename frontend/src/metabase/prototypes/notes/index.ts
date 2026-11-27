import type { PrototypeDefinition } from "../types";

import { NotesPrototype } from "./NotesPrototype";

export const NOTES_PROTOTYPES: PrototypeDefinition[] = [
  {
    id: "notes",
    name: "Notes",
    description: "Decisions and reasoning behind the prototypes.",
    Component: NotesPrototype,
  },
];
