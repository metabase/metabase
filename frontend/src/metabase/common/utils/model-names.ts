import { t } from "ttag";

const TRANSLATED_NAME_BY_MODEL_TYPE: Record<string, string> = {
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
  get pulse() {
    return t`Pulse`;
  },
  get segment() {
    return t`Segment`;
  },
  get table() {
    return t`Table`;
  },
};

export const getTranslatedEntityName = (type: string) =>
  TRANSLATED_NAME_BY_MODEL_TYPE[type] || null;
