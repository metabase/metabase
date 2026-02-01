
/**
 * Compute derived fields from raw query result for a card.
 * Returns computed fields object, or null if no computation needed for this lens/card.
 */
export function computeCardResult(
  lensId: string,
  card: { id: string; metadata?: Record<string, unknown> },
  rows: unknown[][],
): Record<string, unknown> | null {
  return INSPECTOR_V2.computeCardResult(lensId, card, rows);
}
