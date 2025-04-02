import { _useAdminSetting } from "metabase/api";
import type { EnterpriseSettingKey } from "metabase-types/api";

export const useEnterpriseAdminSetting = _useAdminSetting<EnterpriseSettingKey>;
