/* @flow */

import { isAddress } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";

export default PivotByAction("Location", "location", field => isAddress(field));
