/* @flow */

import { t } from "ttag";

import { isCategory, isAddress } from "metabase/lib/schema_metadata";

import PivotByDrill from "./PivotByDrill";

export default PivotByDrill(
  t`Category`,
  "label",
  field => isCategory(field) && !isAddress(field),
);
