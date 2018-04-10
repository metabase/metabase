/* @flow */

import { isAddress } from "metabase/lib/schema_metadata";

import PivotByAction from "./PivotByAction";
import { t } from "c-3po";

export default PivotByAction(t`Location`, "location", field =>
  isAddress(field),
);
