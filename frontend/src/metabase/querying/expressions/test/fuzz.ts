import _ from "underscore";

export const fuzz = process.env.MB_FUZZ ? describe : _.noop;
