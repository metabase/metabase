/* eslint-disable react/prop-types */
import _ from "underscore";
import { connect } from "react-redux";

import { t } from "ttag";
import Radio from "metabase/core/components/Radio/";
import CheckBox from "metabase/core/components/CheckBox";
import Select from "metabase/core/components/Select";
import Toggle from "metabase/core/components/Toggle";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_SELECTORS } from "metabase/plugins";

import {
  StyleContainer,
  DisplayOption,
  DisplayOptionTitle,
  ToggleContainer,
  ToggleLabel,
} from "./DisplayOptionsPane.styled";

const THEME_OPTIONS = [
  { name: t`Light`, value: null },
  { name: t`Dark`, value: "night" },
  { name: t`Transparent`, value: "transparent" },
];

const mapStateToProps = state => ({
  canWhitelabel: PLUGIN_SELECTORS.canWhitelabel(state),
});

const DisplayOptionsPane = ({
  className,
  displayOptions,
  onChangeDisplayOptions,
  canWhitelabel,
  showDownloadDataButtonVisibilityToggle,
}) => {
  const toggleId = useUniqueId("show-download-data-button");
  const fontControlLabelId = useUniqueId("display-option");

  return (
    <div className={className}>
      <DisplayOptionSection title={t`Style`}>
        <StyleContainer>
          <CheckBox
            label={t`Border`}
            checked={displayOptions.bordered}
            onChange={e =>
              onChangeDisplayOptions({
                ...displayOptions,
                bordered: e.target.checked,
              })
            }
          />
          <CheckBox
            label={t`Title`}
            checked={displayOptions.titled}
            onChange={e =>
              onChangeDisplayOptions({
                ...displayOptions,
                titled: e.target.checked,
              })
            }
          />
        </StyleContainer>
      </DisplayOptionSection>
      <DisplayOptionSection title={t`Appearance`}>
        <Radio
          value={displayOptions.theme}
          options={THEME_OPTIONS}
          onChange={value =>
            onChangeDisplayOptions({ ...displayOptions, theme: value })
          }
          variant="normal"
          showButtons
          vertical
        />
      </DisplayOptionSection>
      {canWhitelabel && (
        <>
          <DisplayOptionSection title={t`Font`} titleId={fontControlLabelId}>
            <Select
              value={displayOptions.font}
              options={[
                {
                  name: t`Use instance font`,
                  value: null,
                },
                ...MetabaseSettings.get("available-fonts").map(font => ({
                  name: font,
                  value: font,
                })),
              ]}
              buttonProps={{
                "aria-labelledby": fontControlLabelId,
              }}
              onChange={e => {
                onChangeDisplayOptions({
                  ...displayOptions,
                  font: e.target.value,
                });
              }}
            />
          </DisplayOptionSection>
          {showDownloadDataButtonVisibilityToggle && (
            <DisplayOptionSection title={t`Download data`}>
              <ToggleContainer>
                <ToggleLabel
                  htmlFor={toggleId}
                >{t`Enable users to download data from this embed?`}</ToggleLabel>
                <Toggle
                  id={toggleId}
                  aria-checked={!displayOptions.hide_download_button}
                  role="switch"
                  value={!displayOptions.hide_download_button}
                  onChange={isEnabled => {
                    onChangeDisplayOptions({
                      ...displayOptions,
                      hide_download_button: !isEnabled ? true : null,
                    });
                  }}
                />
              </ToggleContainer>
            </DisplayOptionSection>
          )}
        </>
      )}
    </div>
  );
};

const DisplayOptionSection = ({ title, titleId, children }) => (
  <DisplayOption>
    <DisplayOptionTitle id={titleId}>{title}</DisplayOptionTitle>
    {children}
  </DisplayOption>
);

export default _.compose(connect(mapStateToProps))(DisplayOptionsPane);
