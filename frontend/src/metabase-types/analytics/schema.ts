import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { SimpleEvent } from "./event";

export type SchemaEventMap = {
  account: AccountEvent;
  action: ActionEvent;
  event: SimpleEvent;
};

export type SchemaType = keyof SchemaEventMap;

export type SchemaEvent = SchemaEventMap[SchemaType];
