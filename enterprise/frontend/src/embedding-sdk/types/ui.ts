import type { IconName as InternalIconName } from "metabase/ui";

/**
 * Inline wrapper to properly display the `IconName` type without referencing the `internal` type
 *
 * @inline
 */
type _IconName = InternalIconName;

export type IconName = _IconName;
