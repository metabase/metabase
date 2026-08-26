import { nanoid } from "@reduxjs/toolkit";

import { type BaseEntityId, NANOID_LENGTH } from "../entity-id";

export const createMockEntityId = (value?: string): BaseEntityId =>
  // Unjustified type cast. FIXME
  (value || nanoid(NANOID_LENGTH)) as BaseEntityId;
