import type { Icons } from "metabase/ui";

/**
 * Inline wrapper to properly display the `IconName` type without referencing the `internal` type
 *
 * @inline
 */
type _IconName = keyof typeof Icons;

export type IconName = _IconName;
