/* @flow */

import { t } from "metabase/lib/ttag";

import { isAddress } from "metabase/lib/schema_metadata";

import PivotByDrill from "./PivotByDrill";

export default PivotByDrill(t`Location`, "location", field => isAddress(field));
