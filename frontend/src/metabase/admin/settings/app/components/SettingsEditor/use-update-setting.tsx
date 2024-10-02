import { t } from "ttag";
import _ from "underscore";

import {
  getSettingValues,
  getSettings,
} from "metabase/admin/settings/selectors";
import {
  reloadSettings,
  updateSetting,
} from "metabase/admin/settings/settings";
import type { SettingElement } from "metabase/admin/settings/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { SettingKey, SettingValue } from "metabase-types/api";

export const useUpdateSetting = (): ((
  setting: SettingElement,
  newValue: any,
  options?: { onChanged?: function; onError?: function },
) => Promise<void>) => {
  const settingValues = useSelector(getSettingValues);
  const dispatch = useDispatch();
  const handleChangeSetting = useOnChangeSetting();

  return async (setting: SettingElement, newValue: any, options = {}) => {
    // saveStatusRef.current.setSaving();
    const oldValue = setting.value;

    // TODO: mutation bad!
    setting.value = newValue;

    const handlerParams = [
      oldValue,
      newValue,
      settingValues,
      handleChangeSetting,
    ] as const;

    try {
      if (setting.onBeforeChanged) {
        await setting.onBeforeChanged(...handlerParams);
      }

      if (!setting.disableDefaultUpdate) {
        await dispatch(updateSetting(setting));
      }

      if (setting.onChanged) {
        await setting.onChanged(...handlerParams);
      }

      if (options?.onChanged) {
        await options.onChanged(...handlerParams);
      }

      if (setting.disableDefaultUpdate) {
        await dispatch(reloadSettings());
      }

      if (setting.postUpdateActions) {
        for (const action of setting.postUpdateActions) {
          await dispatch(action());
        }
      }

      // if ((setting.key as EnterpriseSettingKey) === "application-colors") {
      //   saveStatusRef.current.setSaved(
      //     t`Changes saved. Please refresh the page to see them`,
      //   );
      // } else {
      //   saveStatusRef.current.setSaved();
      // }
    } catch (error) {
      console.error(error);
      const message =
        error && (error.message || (error.data && error.data.message));
      // saveStatusRef.current.setSaveError(message);
      if (options?.onError) {
        options.onError(error, message);
      }
    }
  };
};

export const useOnChangeSetting = () => {
  const dispatch = useDispatch();

  const settings = useSelector(getSettings);

  return (key: SettingKey, value: SettingValue) => {
    const setting = _.findWhere(settings, { key });
    if (!setting) {
      console.error(`Attempted to change unknown setting ${key}`);
      throw new Error(t`Unknown setting ${key}`);
    }
    return dispatch(updateSetting({ ...setting, value }));
  };
};
