// eslint-disable-next-line @typescript-eslint/triple-slash-reference, typescript-js/triple-slash-reference -- programs that include only frontend/src/types (Data Apps) need this reference
/// <reference path="../metabase/ui/mantine.d.ts" />

import type { EmbeddingThemeOptions } from "metabase/embedding-sdk/theme/private";

declare module "@mantine/core" {
  // eslint-disable-next-line typescript-js/no-empty-object-type -- module augment
  export interface MantineThemeOther extends EmbeddingThemeOptions {}
}
