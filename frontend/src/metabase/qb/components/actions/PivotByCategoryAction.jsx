/* @flow */

import { isCategory, isAddress } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";

export default PivotByAction(
    "Category",
    "label",
    field => isCategory(field) && !isAddress(field)
);
