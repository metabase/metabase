/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "ttag";

import _ from "underscore";

import colors from "metabase/lib/colors";

import StoreIcon from "../components/StoreIcon";
import Card from "metabase/components/Card";
import Link from "metabase/components/Link";
import ExternalLink from "metabase/components/ExternalLink";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import fitViewport from "metabase/hoc/FitViewPort";

import moment from "moment";

import FEATURES from "../lib/features";
import { StoreApi } from "../lib/services";

@fitViewport
export default class StoreAccount extends React.Component {
  state = {
    status: null,
    error: null,
  };

  async UNSAFE_componentWillMount() {
    try {
      this.setState({
        status: await StoreApi.tokenStatus(),
      });
    } catch (e) {
      this.setState({
        error: e,
      });
    }
  }

  render() {
    const { status, error } = this.state;

    const features =
      status &&
      status.features &&
      _.object(status.features.map(f => [f, true]));
    const expires = status && status.valid_thru && moment(status.valid_thru);

    return (
      <Flex
        align="center"
        justify="center"
        flexDirection="column"
        className={this.props.fitClassNames}
      >
        {error ? (
          error.status === 404 ? (
            <Unlicensed />
          ) : (
            <TokenError />
          )
        ) : (
          <LoadingAndErrorWrapper loading={!status} className="full">
            {() =>
              status.valid && !status.trial ? (
                <Active features={features} expires={expires} />
              ) : !status.valid && !status.trial ? (
                <Expired features={features} expires={expires} />
              ) : status.valid && status.trial ? (
                <TrialActive features={features} expires={expires} />
              ) : !status.valid && status.trial ? (
                <TrialExpired features={features} expires={expires} />
              ) : (
                <h2>{status.status}</h2>
              )
            }
          </LoadingAndErrorWrapper>
        )}
      </Flex>
    );
  }
}

const TokenError = () => (
  <Flex align="center" justify="center" flexDirection="column">
    <h2 className="text-error">{t`We're having trouble validating your token`}</h2>
    <h4 className="mt2">{t`Please double-check that your instance can connect to Metabase's servers`}</h4>
    <ExternalLink
      className="Button Button--primary mt4"
      href="mailto:support@metabase.com"
    >
      {t`Get help`}
    </ExternalLink>
  </Flex>
);

const Unlicensed = () => (
  <AccountStatus
    title={t`Get even more out of Metabase with the Enterprise Edition`}
    subtitle={
      <h4 className="text-centered">{t`All the tools you need to quickly and easily provide reports for your customers, or to help you run and monitor Metabase in a large organization`}</h4>
    }
    preview
  >
    <Box m={4}>
      <ExternalLink
        className="Button Button--primary"
        href={"http://metabase.com/enterprise/"}
      >
        {t`Learn more`}
      </ExternalLink>
      <Link className="Button ml2" to={"admin/store/activate"}>
        {t`Activate a license`}
      </Link>
    </Box>
  </AccountStatus>
);

const TrialActive = ({ features, expires }) => (
  <AccountStatus
    title={t`Your trial is active with these features`}
    subtitle={expires && <h3>{t`Trial expires ${expires.fromNow()}`}</h3>}
    features={features}
  >
    <CallToAction
      title={t`Need help? Ready to buy?`}
      buttonText={t`Talk to us`}
      buttonLink={
        "mailto:support@metabase.com?Subject=Metabase Enterprise Edition"
      }
    />
    <Link
      className="link"
      to={"admin/store/activate"}
    >{t`Activate a license`}</Link>
  </AccountStatus>
);

const TrialExpired = ({ features }) => (
  <AccountStatus title={t`Your trial has expired`} features={features} expired>
    <CallToAction
      title={t`Need more time? Ready to buy?`}
      buttonText={t`Talk to us`}
      buttonLink={
        "mailto:support@metabase.com?Subject=Expired Enterprise Trial"
      }
    />
    <Link
      className="link"
      to={"admin/store/activate"}
    >{t`Activate a license`}</Link>
  </AccountStatus>
);

const Active = ({ features, expires }) => (
  <AccountStatus
    title={t`Your features are active!`}
    subtitle={
      expires && (
        <h3>{t`Your licence is valid through ${expires.format(
          "MMMM D, YYYY",
        )}`}</h3>
      )
    }
    features={features}
  />
);

const Expired = ({ features, expires }) => (
  <AccountStatus
    title={t`Your license has expired`}
    subtitle={
      expires && <h3>{t`It expired on ${expires.format("MMMM D, YYYY")}`}</h3>
    }
    features={features}
    expired
  >
    <CallToAction
      title={t`Want to renew your license?`}
      buttonText={t`Talk to us`}
      buttonLink={
        "mailto:support@metabase.com?Subject=Renewing my Enterprise License"
      }
    />
  </AccountStatus>
);

const AccountStatus = ({
  title,
  subtitle,
  features = {},
  expired,
  preview,
  children,
  className,
}) => {
  // put included features first
  const [included, notIncluded] = _.partition(
    Object.entries(FEATURES),
    ([id, feature]) => features[id],
  );
  const featuresOrdered = [...included, ...notIncluded];
  return (
    <Flex
      align="center"
      justify="center"
      flexDirection="column"
      className={className}
      p={[2, 4]}
      w="100%"
    >
      <Box>
        <h2>{title}</h2>
      </Box>
      {subtitle && (
        <Box mt={2} color={colors["text-medium"]} style={{ maxWidth: 500 }}>
          {subtitle}
        </Box>
      )}
      <Flex mt={4} align="center" flexWrap="wrap" w="100%">
        {featuresOrdered.map(([id, feature]) => (
          <Feature
            key={id}
            feature={feature}
            included={features[id]}
            expired={expired}
            preview={preview}
          />
        ))}
      </Flex>
      {children}
    </Flex>
  );
};

const CallToAction = ({ title, buttonText, buttonLink }) => (
  <Box className="rounded bg-medium m4 py3 px4 flex flex-column layout-centered">
    <h3 className="mb3">{title}</h3>
    <ExternalLink className="Button Button--primary" href={buttonLink}>
      {buttonText}
    </ExternalLink>
  </Box>
);

const Feature = ({ feature, included, expired, preview }) => (
  <Box w={[1, 1 / 2, 1 / 4]} p={2}>
    <Card
      p={[1, 2]}
      style={{
        opacity: expired ? 0.5 : 1,
        width: "100%",
        height: 260,
        backgroundColor: included ? undefined : colors["bg-light"],
        color: included ? colors["text-dark"] : colors["text-medium"],
      }}
      className="relative flex flex-column layout-centered"
    >
      <StoreIcon
        name={feature.icon}
        color={
          preview
            ? colors["brand"]
            : included
            ? colors["success"]
            : colors["text-medium"]
        }
      />

      <Box my={2}>
        <h3 className="text-dark">{feature.name}</h3>
      </Box>

      {preview ? (
        <FeatureDescription feature={feature} />
      ) : included ? (
        <FeatureLinks
          links={feature.docs}
          defaultTitle={t`Learn how to use this`}
        />
      ) : (
        <FeatureLinks links={feature.info} defaultTitle={t`Learn more`} />
      )}

      {!included && !preview && (
        <div className="spread text-centered pt2 pointer-events-none">{t`Not included in your current plan`}</div>
      )}
    </Card>
  </Box>
);

const FeatureDescription = ({ feature }) => (
  <div className="text-centered">{feature.description}</div>
);

const FeatureLinks = ({ links, defaultTitle }) => (
  <Flex align="center">
    {links &&
      links.map(({ link, title }) => (
        <ExternalLink href={link} key={link} className="mx2 link">
          {title || defaultTitle}
        </ExternalLink>
      ))}
  </Flex>
);
