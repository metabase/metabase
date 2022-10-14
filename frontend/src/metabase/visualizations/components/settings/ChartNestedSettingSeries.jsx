/* eslint-disable react/prop-types */
import React from "react";

import { getAccentColors } from "metabase/lib/colors/groups";
import ColorSelector from "metabase/core/components/ColorSelector";
import { SegmentedControl } from "metabase/components/SegmentedControl";
import IconWrapper from "metabase/components/IconWrapper";
import InputBlurChange from "metabase/components/InputBlurChange";
import { OptionsIcon } from "./ChartNestedSettingSeries.styled";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingSeries extends React.Component {
  render() {
    const {
      objects,
      getObjectKey,
      onChangeEditingObject,
      onChangeObjectSettings,
      objectSettingsWidgets,
      object,
      allComputedSettings,
      settings,
    } = this.props;
    const objectKey = object && getObjectKey(object);
    const isSelected = single => objectKey === getObjectKey(single);

    const display = object && object.card.display;
    const isLineAreaBar = ["line", "area", "bar", "combo"].includes(display);
    const isStacked = settings["stackable.stack_type"] != null;

    const computedSettings = allComputedSettings[objectKey] || {};
    console.log("It is time", object);

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
          {/* {isLineAreaBar && !isStacked ? (
            <SegmentedControl
              className="ml1 align-self-stretch"
              value={computedSettings.display}
              options={[
                { value: "line", icon: "line" },
                { value: "area", icon: "area" },
                { value: "bar", icon: "bar" },
              ]}
              onChange={value =>
                onChangeObjectSettings(object, { display: value })
              }
              fullWidth
            />
          ) : null} */}
        </div>
        {objectSettingsWidgets && objectSettingsWidgets.length > 0 ? (
          <div className="mt3">{objectSettingsWidgets}</div>
        ) : null}
      </div>
    );
  }
}
