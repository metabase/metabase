/* eslint-disable react/prop-types */
import React from "react";

import { getAccentColors } from "metabase/lib/colors/groups";
import ColorSelector from "metabase/core/components/ColorSelector";
import InputBlurChange from "metabase/components/InputBlurChange";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingSeries extends React.Component {
  render() {
    const {
      getObjectKey,
      onChangeObjectSettings,
      objectSettingsWidgets,
      object,
      allComputedSettings,
    } = this.props;
    const objectKey = object && getObjectKey(object);

    const computedSettings = allComputedSettings[objectKey] || {};

    return (
      <div key={objectKey} className="px4 align-self-stretch">
        <div className="flex align-center border-bottom pb2">
          <ColorSelector
            value={computedSettings.color}
            colors={getAccentColors()}
            onChange={value => onChangeObjectSettings(object, { color: value })}
          />
          <InputBlurChange
            className="input flex-full ml1 align-self-stretch"
            size={1}
            value={computedSettings.title}
            onBlurChange={e =>
              onChangeObjectSettings(object, { title: e.target.value })
            }
          />
        </div>
        {objectSettingsWidgets && objectSettingsWidgets.length > 0 ? (
          <div className="mt3">{objectSettingsWidgets}</div>
        ) : null}
      </div>
    );
  }
}
