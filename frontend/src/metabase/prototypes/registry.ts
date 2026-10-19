import { t } from "ttag";

import { PrototypeA } from "./canvases/PrototypeA";
import { PrototypeB } from "./canvases/PrototypeB";
import type { PrototypeDefinition } from "./types";

export const PROTOTYPES: PrototypeDefinition[] = [
  {
    id: "a",
    get name() {
      return t`Prototype A`;
    },
    get description() {
      return t`An empty canvas.`;
    },
    Component: PrototypeA,
  },
  {
    id: "b",
    get name() {
      return t`Prototype B`;
    },
    get description() {
      return t`Another empty canvas.`;
    },
    Component: PrototypeB,
  },
];
