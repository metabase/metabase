import type { AccountEvent } from "./account";
import type { SimpleEvent } from "./event";

export type SchemaEventMap = {
  account: AccountEvent;
  event: SimpleEvent;
};

export type SchemaType = keyof SchemaEventMap;

export type SchemaEvent = SchemaEventMap[SchemaType];
