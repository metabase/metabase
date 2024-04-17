/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Confirm from "metabase/components/Confirm";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import { ActionsApi, CardApi, DashboardApi } from "metabase/services";
import { Icon, Stack, Text } from "metabase/ui";

import { RevokeIconWrapper } from "./PublicLinksListing.styled";

class PublicLinksListing extends Component {
  constructor(props) {
    super(props);
    this.state = {
      list: null,
      error: null,
    };
  }

  componentDidMount() {
    this.load();
  }

  async load() {
    try {
      const list = await this.props.load();
      this.setState({ list });
    } catch (error) {
      this.setState({ error });
    }
  }

  async revoke(link) {
    if (!this.props.revoke) {
      return;
    }
    try {
      await this.props.revoke(link);
      this.load();
    } catch (error) {
      alert(error);
    }
  }

  trackEvent(label) {
    MetabaseAnalytics.trackStructEvent(`Admin ${this.props.type}`, label);
  }

  render() {
    const { getUrl, getPublicUrl, revoke, noLinksMessage } = this.props;
    let { list, error } = this.state;

    if (list && list.length === 0) {
      error = new Error(noLinksMessage);
    }

    return (
      <LoadingAndErrorWrapper loading={!list} error={error}>
        {() => (
          <table
            data-testId={this.props["data-testId"]}
            className={AdminS.ContentTable}
          >
            <thead>
              <tr>
                <th>{t`Name`}</th>
                {getPublicUrl && <th>{t`Public Link`}</th>}
                {revoke && <th>{t`Revoke Link`}</th>}
              </tr>
            </thead>
            <tbody>
              {list &&
                list.map(link => (
                  <tr key={link.id}>
                    <td>
                      {getUrl ? (
                        <Link
                          to={getUrl(link)}
                          onClick={() => this.trackEvent("Entity Link Clicked")}
                          className={CS.textWrap}
                        >
                          {link.name}
                        </Link>
                      ) : (
                        link.name
                      )}
                    </td>
                    {getPublicUrl && (
                      <td>
                        <ExternalLink
                          href={getPublicUrl(link)}
                          onClick={() => this.trackEvent("Public Link Clicked")}
                          className={cx(CS.link, CS.textWrap)}
                        >
                          {getPublicUrl(link)}
                        </ExternalLink>
                      </td>
                    )}
                    {revoke && (
                      <td className={cx(CS.flex, CS.layoutCentered)}>
                        <Confirm
                          title={t`Disable this link?`}
                          content={t`They won't work anymore, and can't be restored, but you can create new links.`}
                          action={() => {
                            this.revoke(link);
                            this.trackEvent("Revoked link");
                          }}
                        >
                          <RevokeIconWrapper
                            name="close"
                            aria-label={t`Revoke link`}
                          >
                            <Icon name="close" />
                          </RevokeIconWrapper>
                        </Confirm>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}

export const PublicLinksDashboardListing = () => (
  <PublicLinksListing
    load={DashboardApi.listPublic}
    revoke={DashboardApi.deletePublicLink}
    type={t`Public Dashboard Listing`}
    getUrl={dashboard => Urls.dashboard(dashboard)}
    getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
    noLinksMessage={t`No dashboards have been publicly shared yet.`}
  />
);

export const PublicLinksQuestionListing = () => (
  <PublicLinksListing
    load={CardApi.listPublic}
    revoke={CardApi.deletePublicLink}
    type={t`Public Card Listing`}
    getUrl={question => Urls.question(question)}
    getPublicUrl={({ public_uuid }) =>
      Urls.publicQuestion({ uuid: public_uuid })
    }
    noLinksMessage={t`No questions have been publicly shared yet.`}
  />
);

const mapStateToProps = state => ({
  siteUrl: getSetting(state, "site-url"),
});

export const PublicLinksActionListing = connect(mapStateToProps)(
  function PublicLinksActionListing({ siteUrl }) {
    return (
      <PublicLinksListing
        load={ActionsApi.listPublic}
        revoke={ActionsApi.deletePublicLink}
        type={t`Public Action Form Listing`}
        getUrl={action => Urls.action({ id: action.model_id }, action.id)}
        getPublicUrl={({ public_uuid }) =>
          Urls.publicAction(siteUrl, public_uuid)
        }
        noLinksMessage={t`No actions have been publicly shared yet.`}
      />
    );
  },
);

export const EmbeddedResources = () => (
  <Stack spacing="md" className={CS.flexFull}>
    <div>
      <Text mb="sm">{t`Embedded Dashboards`}</Text>
      <div
        className={cx(CS.bordered, CS.rounded, CS.full)}
        style={{ maxWidth: 820 }}
      >
        <PublicLinksListing
          data-testId="-embedded-dashboards-setting"
          load={DashboardApi.listEmbeddable}
          getUrl={dashboard => Urls.dashboard(dashboard)}
          type={t`Embedded Dashboard Listing`}
          noLinksMessage={t`No dashboards have been embedded yet.`}
        />
      </div>
    </div>

    <div>
      <Text mb="sm">{t`Embedded Questions`}</Text>
      <div
        className={cx(CS.bordered, CS.rounded, CS.full)}
        style={{ maxWidth: 820 }}
      >
        <PublicLinksListing
          data-testId="-embedded-questions-setting"
          load={CardApi.listEmbeddable}
          getUrl={question => Urls.question(question)}
          type={t`Embedded Card Listing`}
          noLinksMessage={t`No questions have been embedded yet.`}
        />
      </div>
    </div>
  </Stack>
);
