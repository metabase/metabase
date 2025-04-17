import type { Icons } from "metabase/ui";

/**
 * Needed to properly unwrap all values of the `IconName` type in documentation
 * @inline
 */
type IconNameValues = keyof typeof Icons;

export type IconName = IconNameValues;
