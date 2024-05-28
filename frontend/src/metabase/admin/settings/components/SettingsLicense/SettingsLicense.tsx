import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getUpgradeUrl } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";

import { ExplorePlansIllustration } from "./ExplorePlansIllustration";
import {
  ExplorePaidPlansContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
  SubHeader,
} from "./SettingsLicense.styled";

interface StateProps {
  upgradeUrl: string;
}

type SettingsLicenseProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  upgradeUrl: getUpgradeUrl(state, { utm_media: "license" }),
});

const SettingsLicense = ({ upgradeUrl }: SettingsLicenseProps) => {
  return (
    <SettingsLicenseContainer>
      <SectionHeader>{t`Looking for more?`}</SectionHeader>
      <SectionDescription>
        {t`Metabase is open source and will be free forever – but by upgrading you can have priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.`}
      </SectionDescription>
      <SubHeader>{t`Want to know more?`}</SubHeader>
      <ExplorePaidPlansContainer>
        <Button as={ExternalLink} primary href={upgradeUrl}>
          {t`Explore our paid plans`}
        </Button>
        <ExplorePlansIllustration />
      </ExplorePaidPlansContainer>
    </SettingsLicenseContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(SettingsLicense);
