import { nanoid } from "@reduxjs/toolkit";
import _ from "underscore";

import { type BaseEntityId, NANOID_LENGTH } from "../entity-id";

export const createMockEntityId = (): BaseEntityId =>
  nanoid(NANOID_LENGTH) as BaseEntityId;
