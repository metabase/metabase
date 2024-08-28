const NANOID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NANOID_LENGTH = 21;

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };
type NanoID = Brand<string, "NanoID">;

export const isNanoID = (id: unknown): id is NanoID => {
  return (
    typeof id === "string" &&
    id.length === NANOID_LENGTH &&
    new RegExp(`^[${NANOID_ALPHABET}]+$`).test(id)
  );
};

export const asNanoID = (id: string): NanoID => {
  if (!isNanoID(id)) {
    throw new Error("Invalid NanoID");
  }
  return id as NanoID;
};

export type BaseEntityId = NanoID;
