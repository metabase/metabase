import type { ForeignKey, ForeignKeyField } from "../foreign-key";
import { createMockField } from "./field";
import { createMockTable } from "./table";

type MockForeignKeyOpts = Pick<
  ForeignKey,
  "origin" | "destination" | "relationship"
>;

export const createMockForeignKeyField = (
  opts?: Partial<ForeignKeyField>,
): ForeignKeyField => ({
  id: 1,
  ...createMockField(opts),
  table: createMockTable(opts?.table),
});

export const createMockForeignKey = ({
  origin = createMockForeignKeyField({
    id: 1,
    table_id: 1,
    table: createMockTable({ id: 1 }),
  }),
  destination = createMockForeignKeyField({
    id: 2,
    table_id: 2,
    table: createMockTable({ id: 2 }),
  }),
  relationship = "Mt1",
}: Partial<MockForeignKeyOpts>): ForeignKey => ({
  origin,
  origin_id: origin.id,
  destination,
  destination_id: destination.id,
  relationship,
});
