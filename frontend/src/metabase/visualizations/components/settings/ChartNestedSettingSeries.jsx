import React from "react";
import ColorPicker from "metabase/components/ColorPicker";
import Icon from "metabase/components/Icon";

import cx from "classnames";

const ButtonGroup = ({
  value,
  onChange,
  options,
  optionNameFn = o => o.name,
  optionValueFn = o => o.value,
  optionKeyFn = optionValueFn,
  className,
}) => {
  return (
    <div className={cx(className, "rounded bordered flex")}>
      {options.map((o, index) => (
        <div
          key={optionKeyFn(o)}
          className={cx(
            "flex align-center text-brand-hover p1 cursor-pointer",
            { "border-left": index > 0 },
            optionValueFn(o) === value ? "text-brand" : "text-medium",
          )}
          onClick={() => onChange(optionValueFn(o))}
        >
          {optionNameFn(o)}
        </div>
      ))}
    </div>
  );
};

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
    } = this.props;
    const objectKey = object && getObjectKey(object);
    const isSelected = single => objectKey === getObjectKey(single);

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
