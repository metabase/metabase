import _ from "underscore";

import {
  type BaseEntityId,
  NANOID_ALPHABET,
  NANOID_LENGTH,
} from "../entity-id";

export const createMockEntityId = (): BaseEntityId =>
  _.times(NANOID_LENGTH, () => {
    const randomIndex = _.random(0, NANOID_ALPHABET.length - 1);
    return NANOID_ALPHABET[randomIndex];
  }).join("") as BaseEntityId;
