export interface Collection {
  id: number;
}

export const createCollection = (opts?: Partial<Collection>): Collection => ({
  id: 1,
  ...opts,
});
