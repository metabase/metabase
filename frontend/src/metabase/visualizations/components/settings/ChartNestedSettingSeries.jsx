/* @flow */

import React from "react";

import ColorPicker from "metabase/components/ColorPicker";
import ButtonGroup from "metabase/components/ButtonGroup";
import Icon from "metabase/components/Icon";
import IconWrapper from "metabase/components/IconWrapper";

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

    const display = object && object.card.display;
    const isLineAreaBar = ["line", "area", "bar", "combo"].includes(display);
    const isStacked = settings["stackable.stack_type"] != null;

    return (
      <div>
        {objects.length < 100 &&
          objects.map(single => {
            const key = getObjectKey(single);
            const settings = allComputedSettings[key] || {};
            return (
              <div
                key={key}
                className="px4 pt2 mt2 border-top align-self-stretch"
              >
                <div className="flex align-center">
                  <ColorPicker
                    value={settings.color}
                    triggerSize={21}
                    onChange={value =>
                      onChangeObjectSettings(single, { color: value })
                    }
                  />
                  <input
                    className="input flex-full ml1 align-self-stretch"
                    // set vertical padding to 0 and use align-self-stretch to match siblings
                    style={{ paddingTop: 0, paddingBottom: 0 }}
                    size={1}
                    value={settings.title}
                    onChange={e =>
                      onChangeObjectSettings(single, { title: e.target.value })
                    }
                  />
                  {isLineAreaBar && !isStacked ? (
                    <ButtonGroup
                      className="ml1 align-self-stretch"
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
                    <IconWrapper className="ml1 p1">
                      <Icon
                        className="text-medium cursor-pointer text-brand-hover"
                        name={isSelected(single) ? "chevronup" : "chevrondown"}
                        tooltip={
                          isSelected(single) ? "Hide options" : "More options"
                        }
                        onClick={() =>
                          onChangeEditingObject(
                            isSelected(single) ? null : single,
                          )
                        }
                      />
                    </IconWrapper>
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
