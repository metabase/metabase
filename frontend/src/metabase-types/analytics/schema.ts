import type { AccountEvent } from "./account";
import type { ActionEvent } from "./action";
import type { BrowseDataEvent } from "./browse_data";
import type { SimpleEvent } from "./event";

export type SchemaEventMap = {
  account: AccountEvent;
  action: ActionEvent;
  browse_data: BrowseDataEvent;
  event: SimpleEvent;
};

export type SchemaType = keyof SchemaEventMap;

export type SchemaEvent = SchemaEventMap[SchemaType];
