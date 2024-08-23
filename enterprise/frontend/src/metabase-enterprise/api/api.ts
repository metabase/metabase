import { Api } from "metabase/api";

import { ENTERPRISE_TAG_TYPES } from "./tags";

export const EnterpriseApi = Api.enhanceEndpoints({
  addTagTypes: ENTERPRISE_TAG_TYPES,
});
