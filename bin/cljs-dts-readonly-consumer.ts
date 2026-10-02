import type * as Shared from "cljs/metabase.lib.shared";
import * as Fixture from "cljs/metabase.util.malli.typescript.fixture";

declare const column: Shared.Metabase_Lib_Schema_Metadata_Column;
// @ts-expect-error opt-in readonly declarations reject property mutation
column.name = "renamed";

const camel = Fixture.readonly_camel();
// @ts-expect-error opt-in readonly declarations reject camelCase fixture mutation
camel.displayName = "renamed";
