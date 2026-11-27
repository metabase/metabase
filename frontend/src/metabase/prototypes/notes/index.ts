import type { PrototypeDefinition } from "../types";

import { NotesPrototype, QuestionsPrototype } from "./NotesPrototype";

export const NOTES_PROTOTYPES: PrototypeDefinition[] = [
  {
    id: "notes",
    name: "Notes",
    description: "Decisions and reasoning behind the prototypes.",
    Component: NotesPrototype,
  },
  {
    id: "questions",
    name: "Questions",
    description: "Open questions the prototypes raise.",
    Component: QuestionsPrototype,
  },
];
