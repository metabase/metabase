export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;

export function getQuestionVirtualTableId(id: number | string) {
  return `card__${id}`;
}

export function isVirtualCardId(tableId?: unknown): tableId is string {
  return typeof tableId === "string" && tableId.startsWith("card__");
}

export function getQuestionIdFromVirtualTableId(
  tableId: unknown,
): number | null {
  if (typeof tableId !== "string") {
    return null;
  }
  const id = parseInt(tableId.replace("card__", ""));
  return Number.isSafeInteger(id) ? id : null;
}
