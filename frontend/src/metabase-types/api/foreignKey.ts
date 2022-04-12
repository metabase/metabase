import { Field } from "../types/Field";

export interface ForeignKey {
  destination: Field;
  destination_id: number;
  origin: Field;
  origin_id: number;
  relationship: string; // enum?
}
