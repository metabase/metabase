/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t, jt } from "ttag";
import { Flex, Box } from "grid-styled";
import cx from "classnames";

import MetabaseSettings from "metabase/lib/settings";
import SettingsSetting from "./SettingsSetting";

import HostingInfoLink from "metabase/admin/settings/components/widgets/HostingInfoLink";
import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";
import ExternalLink from "metabase/components/ExternalLink";

export default class SettingsUpdatesForm extends Component {
  static propTypes = {
    elements: PropTypes.array,
  };

  renderVersionUpdateNotice() {
    const currentVersion = formatVersion(MetabaseSettings.currentVersion());

    if (MetabaseSettings.isHosted()) {
      return (
        <div>{jt`Metabase Cloud keeps your instance up-to-date. You're currently on version ${currentVersion}. Thanks for being a customer!`}</div>
      );
    }

    if (MetabaseSettings.versionIsLatest()) {
      const shouldShowHostedCta = !MetabaseSettings.isEnterprise();
      return (
        <div>
          <div className="p2 bg-brand bordered rounded border-brand text-white text-bold">
            {jt`You're running Metabase ${currentVersion} which is the latest and greatest!`}
          </div>
          {shouldShowHostedCta && <HostingCTA />}
        </div>
      );
    } else if (MetabaseSettings.newVersionAvailable()) {
      const latestVersion = MetabaseSettings.latestVersion();
      const versionInfo = MetabaseSettings.versionInfo();
      return (
        <div>
          <div className="p2 bg-green bordered rounded border-success flex flex-row align-center justify-between">
            <span className="text-white text-bold">
              {jt`Metabase ${formatVersion(latestVersion)} is available.`}{" "}
              {jt`You're running ${currentVersion}`}
            </span>
            <ExternalLink
              data-metabase-event={
                "Updates Settings; Update link clicked; " + latestVersion
              }
              className="Button Button--white Button--medium borderless"
              href={
                "https://www.metabase.com/docs/" +
                latestVersion +
                "/operations-guide/upgrading-metabase.html"
              }
            >
              {t`Update`}
            </ExternalLink>
          </div>

          <div
            className="text-medium bordered rounded p2 mt2 overflow-y-scroll"
            style={{ height: 330 }}
          >
            <h3 className="pb3 text-uppercase">{t`What's Changed:`}</h3>

            <Version version={versionInfo.latest} />

            {versionInfo.older &&
              versionInfo.older.map((version, index) => (
                <Version key={index} version={version} />
              ))}
          </div>

          {!MetabaseSettings.isHosted() && <HostingCTA />}
        </div>
      );
    } else {
      return <div>{t`No successful checks yet.`}</div>;
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
        {!MetabaseSettings.isHosted() && <ul>{settings}</ul>}

        <div className="px2">
          <div
            className={cx("pt3", {
              "border-top": !MetabaseSettings.isHosted(),
            })}
          >
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
          version.highlights.map((highlight, index) => (
            <li key={index} style={{ lineHeight: "1.5" }} className="pl1">
              {highlight}
            </li>
          ))}
      </ul>
    </div>
  );
}

function HostingCTA() {
  if (MetabaseSettings.isEnterprise()) {
    return null;
  }

  return (
    <Flex
      justifyContent="space-between"
      alignItems="center"
      className="rounded bg-light mt4 text-brand py2 px1"
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
      <Box className="pr1">
        <HostingInfoLink text={t`Learn more`} />
      </Box>
    </Flex>
  );
}

function formatVersion(versionLabel = "") {
  return versionLabel.replace(/^v/, "");
}
