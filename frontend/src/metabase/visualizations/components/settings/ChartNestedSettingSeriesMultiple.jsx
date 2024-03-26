/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import IconWrapper from "metabase/components/IconWrapper";
import ColorSelector from "metabase/core/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { getAccentColors } from "metabase/lib/colors/groups";

import {
  OptionsIcon,
  SeriesNameInput,
} from "./ChartNestedSettingSeries.styled";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingSeriesMultiple extends Component {
  render() {
    const {
      objects,
      getObjectKey,
      onChangeEditingObject,
      onChangeObjectSettings,
      objectSettingsWidgets,
      object,
      allComputedSettings,
      seriesCardNames,
    } = this.props;
    const objectKey = object && getObjectKey(object);
    const isSelected = single => objectKey === getObjectKey(single);

    return (
      <div data-testid="series-settings">
        {objects.length < 100 &&
          objects.map(single => {
            const key = getObjectKey(single);
            const settings = allComputedSettings[key] || {};
            const seriesCardName = seriesCardNames?.[key];
            return (
              <div
                key={key}
                className={cx(
                  CS.px4,
                  CS.pt2,
                  CS.mt2,
                  CS.borderTop,
                  CS.alignSelfStretch,
                )}
              >
                <div className={cx(CS.flex, CS.alignCenter)}>
                  <ColorSelector
                    value={settings.color}
                    colors={getAccentColors()}
                    onChange={value =>
                      onChangeObjectSettings(single, { color: value })
                    }
                  />
                  <SeriesNameInput
                    className={cx(CS.flexFull, CS.ml1, CS.alignSelfStretch)}
                    // set vertical padding to 0 and use align-self-stretch to match siblings
                    style={{ paddingTop: 0, paddingBottom: 0 }}
                    aria-label="series-name-input"
                    value={settings.title}
                    subtitle={
                      seriesCardName === settings.title ? "" : seriesCardName
                    }
                    onBlurChange={e =>
                      onChangeObjectSettings(single, { title: e.target.value })
                    }
                  />
                  {objects.length > 1 ? (
                    <IconWrapper className={cx(CS.ml1, CS.p1)}>
                      <OptionsIcon
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
                  <div className={CS.mt3}>{objectSettingsWidgets}</div>
                ) : null}
              </div>
            );
          })}
      </div>
    );
  }
}
