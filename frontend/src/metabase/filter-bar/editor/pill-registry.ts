import type { PillToken } from "../model/types";

export type PillRegistry<F> = Map<string, PillToken<F>>;

export const createPillRegistry = <F>(): PillRegistry<F> => new Map();

export const registerPill = <F>(
  registry: PillRegistry<F>,
  token: PillToken<F>,
): string => {
  const id = String(registry.size);
  registry.set(id, token);
  return id;
};
