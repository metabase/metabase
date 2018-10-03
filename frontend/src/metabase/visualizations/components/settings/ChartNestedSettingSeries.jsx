/* @flow */

import React from "react";

import ColorPicker from "metabase/components/ColorPicker";
import ButtonGroup from "metabase/components/ButtonGroup";
import Icon from "metabase/components/Icon";

import type { NestedSettingComponentProps } from "./ChartSettingNestedSettings";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingSeries extends React.Component {
  props: NestedSettingComponentProps;

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

    const isStacked = settings["stackable.stack_type"] != null;

    return (
      <div>
        {objects.map(single => {
          const key = getObjectKey(single);
          const settings = allComputedSettings[key] || {};
          return (
            <div key={key} className="pl4 pr2 pb2 mb2 border-bottom">
              <div className="flex align-center">
                <ColorPicker
                  className="align-self-stretch"
                  value={settings.color}
                  triggerSize={28}
                  onChange={value =>
                    onChangeObjectSettings(single, { color: value })
                  }
                />
                <input
                  className="input align-self-stretch flex-full ml1"
                  size={1}
                  value={settings.title}
                  onChange={e =>
                    onChangeObjectSettings(single, { title: e.target.value })
                  }
                />
                {!isStacked ? (
                  <ButtonGroup
                    className="align-self-stretch ml1"
                    value={settings.display}
                    options={["line", "area", "bar"]}
                    optionValueFn={o => o}
                    optionNameFn={o => <Icon name={o} />}
                    onChange={value =>
                      onChangeObjectSettings(single, { display: value })
                    }
                  />
                ) : null}
                {objects.length > 1 ? (
                  <Icon
                    className="ml2 text-medium cursor-pointer text-brand-hover"
                    name={isSelected(single) ? "chevronup" : "chevrondown"}
                    onClick={() =>
                      onChangeEditingObject(isSelected(single) ? null : single)
                    }
                  />
                ) : null}
              </div>
              {objectSettingsWidgets &&
              objectSettingsWidgets.length > 0 &&
              isSelected(single) ? (
                <div className="mt3">{objectSettingsWidgets}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }
}
