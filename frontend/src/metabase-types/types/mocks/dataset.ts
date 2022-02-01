import { Column } from "../Dataset";

export function createMockColumn({
  name = "count",
  display_name = name,
  base_type = "type/BigInteger",
  effective_type = base_type,
  ...rest
}: Partial<Column> = {}): Column {
  return {
    name,
    display_name,
    base_type,
    effective_type,
    ...rest,
  };
}
