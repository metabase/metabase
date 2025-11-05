import type { MBQLClauseDefinition } from "./types";

const names = new Set();

export function defineClauses<
  const T extends Record<string, MBQLClauseDefinition>,
>(
  options: Partial<MBQLClauseDefinition>,
  clauses: T,
): Record<keyof T, MBQLClauseDefinition> {
  const result = {} as Record<keyof T, MBQLClauseDefinition>;
  for (const name in clauses) {
    if (names.has(name)) {
      throw new Error(`Duplicate clause name: ${name}`);
    }
    names.add(name);
    result[name] = {
      ...options,
      ...clauses[name],
    };
  }
  return result;
}

export function op(operator: string, ...args: unknown[]): any {
  return { operator, options: {}, args };
}

export function dimension(name: string) {
  return op("dimension", name);
}
