import slugg from "slugg";

import type DatabaseV1 from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import { SAVED_QUESTIONS_VIRTUAL_DB_ID } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { CubeDataItem, Database } from "metabase-types/api";

import { appendSlug } from "./utils";

const removeJsExtension = (filename:string) => {
    if (filename.endsWith('.js')) {
      return filename.slice(0, -3);
    }
    return filename;
  }

export function browseCube(cube: CubeDataItem) {
  const name = removeJsExtension(cube.fileName)


  return appendSlug(`/browse/semantic-layer/${name}`);
}

export function browseCubeFlow() {
return appendSlug('/browse/data-map');
}
