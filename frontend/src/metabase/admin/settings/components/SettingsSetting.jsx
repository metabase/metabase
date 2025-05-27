/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import scrollIntoView from "scroll-into-view-if-needed";
import { jt } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { alpha } from "metabase/lib/colors";
import { Box } from "metabase/ui";

import { settingToFormFieldId, useGetEnvVarDocsUrl } from "../utils";

import { SettingHeader } from "./SettingHeader";
import {
  SettingContent,
  SettingEnvVarMessage,
  SettingErrorMessage,
  SettingRoot,
  SettingWarningMessage,
} from "./SettingsSetting.styled";
import { SettingInput } from "./widgets/SettingInput";
import SettingNumber from "./widgets/SettingNumber";
import SettingPassword from "./widgets/SettingPassword";
import SettingRadio from "./widgets/SettingRadio";
import SettingText from "./widgets/SettingText";
import { SettingToggle } from "./widgets/SettingToggle";
import SettingSelect from "./widgets/deprecated/SettingSelect";

const SETTING_WIDGET_MAP = {
  string: SettingInput,
  number: SettingNumber,
  password: SettingPassword,
  select: SettingSelect,
  radio: SettingRadio,
  boolean: SettingToggle,
  text: SettingText,
  hidden: () => null,
};

export const SettingsSetting = (props) => {
  const [fancyStyle, setFancyStyle] = useState({});
  const thisRef = useRef();

  // we don't want to pass down autoScrollIntoView to the widget
  const { autoScrollIntoView, ...propsToPassDown } = props;

  const { setting, settingValues, errorMessage } = props;

  useEffect(() => {
    if (autoScrollIntoView && thisRef.current) {
      scrollIntoView(thisRef.current, {
        behavior: "smooth",
        block: "center",
        scrollMode: "if-needed",
      });

      setFancyStyle({
        background: alpha("brand", 0.1),
        boxShadow: `0 0 0 1px var(--mb-color-brand)`,
      });

      setTimeout(() => {
        setFancyStyle({});
      }, 1500);
    }
  }, [autoScrollIntoView]);

  const settingId = settingToFormFieldId(setting);

  let Widget = setting.widget || SETTING_WIDGET_MAP[setting.type];
  if (!Widget) {
    console.warn(
      "No render method for setting type " +
        setting.type +
        ", defaulting to string input.",
    );
    Widget = SettingInput;
  }

  const widgetProps = {
    ...setting.getProps?.(setting, settingValues),
    ...setting.props,
    ...propsToPassDown,
  };

  return (
    // TODO - this formatting needs to be moved outside this component
    <SettingRoot
      data-testid={`${setting.key}-setting`}
      ref={thisRef}
      style={{
        transition: "500ms ease all",
        ...fancyStyle,
      }}
    >
      {!setting.noHeader && (
        <SettingHeader
          id={settingId}
          title={setting.display_name}
          description={setting.description}
        />
      )}
      <SettingContent>
        {setting.is_env_setting && !setting.forceRenderWidget ? (
          <SetByEnvVar setting={setting} />
        ) : (
          <Widget id={settingId} {...widgetProps} />
        )}
      </SettingContent>
      {errorMessage && (
        <SettingErrorMessage>{errorMessage}</SettingErrorMessage>
      )}
      {setting.warning && (
        <SettingWarningMessage>{setting.warning}</SettingWarningMessage>
      )}
    </SettingRoot>
  );
};

/**
 * @deprecated
 * use SetByEnvVar from metabase/admin/settings/components/widgets/AdminSettingInput instead
 */
export const SetByEnvVar = ({ setting }) => {
  const { url: docsUrl } = useGetEnvVarDocsUrl(setting.env_name);

  return (
    <SettingEnvVarMessage data-testid="setting-env-var-message">
      {jt`This has been set by the ${(
        <ExternalLink key={docsUrl} href={docsUrl}>
          {setting.env_name}
        </ExternalLink>
      )} environment variable.`}
    </SettingEnvVarMessage>
  );
};

export const SetByEnvVarWrapper = ({ setting, children }) => {
  if (setting.is_env_setting) {
    return (
      <Box mb="lg">
        <SettingHeader
          id={setting.key}
          title={setting.display_name}
          description={setting.description}
        />
        <SetByEnvVar setting={setting} />
      </Box>
    );
  }
  return children;
};
