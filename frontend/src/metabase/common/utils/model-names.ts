import { t } from "ttag";

import type { SearchModel } from "metabase-types/api";

const TRANSLATED_NAME_BY_MODEL_TYPE: Record<SearchModel, string> = {
  get action() {
    return t`Action`;
  },
  get card() {
    return t`Question`;
  },
  get collection() {
    return t`Collection`;
  },
  get dashboard() {
    return t`Dashboard`;
  },
  get database() {
    return t`Database`;
  },
  get dataset() {
    return t`Model`;
  },
  get "indexed-entity"() {
    return t`Indexed record`;
  },
  get metric() {
    return t`Metric`;
  },
  get segment() {
    return t`Segment`;
  },
  get table() {
    return t`Table`;
  },
  get document() {
    return t`Document`;
  },
  get transform() {
    return t`Transform`;
  },
};

export const getTranslatedEntityName = (type: SearchModel) =>
  TRANSLATED_NAME_BY_MODEL_TYPE[type] || null;
