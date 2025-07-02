import { nanoid } from "@reduxjs/toolkit";

import { type BaseEntityId, NANOID_LENGTH } from "../entity-id";

export const createMockEntityId = (value?: string): BaseEntityId =>
  (value || nanoid(NANOID_LENGTH)) as BaseEntityId;
