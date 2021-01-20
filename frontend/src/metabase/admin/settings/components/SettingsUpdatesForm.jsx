import React, { Component } from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";
import { Flex, Box } from "grid-styled";
import MetabaseSettings from "metabase/lib/settings";
import SettingsSetting from "./SettingsSetting";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

export default class SettingsUpdatesForm extends Component {
  static propTypes = {
    elements: PropTypes.array,
  };

  renderVersionUpdateNotice() {
    if (MetabaseSettings.versionIsLatest()) {
      const currentVersion = MetabaseSettings.currentVersion();
      return (
        <div>
          <div className="p2 bg-brand bordered rounded border-brand text-white text-bold">
            {jt`You're running Metabase ${formatVersion(
              currentVersion,
            )} which is the latest and greatest!`}
          </div>
          <HostingCTA />
        </div>
      );
    } else if (MetabaseSettings.newVersionAvailable()) {
      const currentVersion = MetabaseSettings.currentVersion();
      const latestVersion = MetabaseSettings.latestVersion();
      const versionInfo = MetabaseSettings.versionInfo();
      return (
        <div>
          <div className="p2 bg-green bordered rounded border-success flex flex-row align-center justify-between">
            <span className="text-white text-bold">
              {jt`Metabase ${formatVersion(latestVersion)} is available.`}{" "}
              {jt`You're running ${formatVersion(currentVersion)}`}
            </span>
            <a
              data-metabase-event={
                "Updates Settings; Update link clicked; " + latestVersion
              }
              className="Button Button--white Button--medium borderless"
              href="https://metabase.com/start/"
              target="_blank"
            >
              {t`Update`}
            </a>
          </div>

          <div
            className="text-medium bordered rounded p1 overflow-scroll"
            style={{ maxHeight: 330 }}
          >
            <h3 className="py3 text-uppercase">{t`What's Changed:`}</h3>

            <Version version={versionInfo.latest} />

            {versionInfo.older &&
              versionInfo.older.map(version => <Version version={version} />)}
          </div>
        </div>
      );
    } else {
      return (
        <div>{t`Sorry, we were unable to check for updates at this time.`}</div>
      );
    }
  }

  render() {
    const { elements, updateSetting } = this.props;

    const settings = elements.map((setting, index) => (
      <SettingsSetting
        key={setting.key}
        setting={setting}
        onChange={value => updateSetting(setting, value)}
        autoFocus={index === 0}
      />
    ));

    return (
      <div style={{ width: "585px" }}>
        <ul>{settings}</ul>

        <div className="px2">
          <div className="pt3 border-top">
            {this.renderVersionUpdateNotice()}
          </div>
        </div>
      </div>
    );
  }
}

function Version({ version }) {
  if (!version) {
    return null;
  }
  return (
    <div className="pb3">
      <h3 className="text-medium">
        {formatVersion(version.version)}{" "}
        {version.patch ? "(" + t`patch release` + ")" : null}
      </h3>
      <ul style={{ listStyleType: "disc", listStylePosition: "inside" }}>
        {version.highlights &&
          version.highlights.map(highlight => (
            <li style={{ lineHeight: "1.5" }} className="pl1">
              {highlight}
            </li>
          ))}
      </ul>
    </div>
  );
}

function HostingCTA() {
  return (
    <Flex
      justifyContent="space-between"
      alignItems="center"
      className="rounded bg-light mt4 text-brand p2"
    >
      <Flex>
        <Flex
          className="circular bg-medium align-center justify-center ml1 mr2"
          h={32}
          w={52}
        >
          <Icon name="cloud" size={24} />
        </Flex>
        <div>
          <Text className="text-brand mb0">{t`Want to have upgrades taken care of for you?`}</Text>
          <Text className="text-brand text-bold">{t`Migrate to Metabase Cloud.`}</Text>
        </div>
      </Flex>
      <Box>
        <ExternalLink
          className="bordered rounded border-brand bg-brand-hover text-white-hover px2 py1 mr2 text-bold flex align-center"
          href={"https://www.metabase.com/start/hosted/"}
          target="_blank"
        >
          {t`Learn more`}
        </ExternalLink>
      </Box>
    </Flex>
  );
}

function formatVersion(versionLabel = "") {
  return versionLabel.replace(/^v/, "");
}
