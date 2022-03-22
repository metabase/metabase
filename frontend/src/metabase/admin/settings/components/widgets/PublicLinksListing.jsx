/* eslint-disable react/prop-types */
import React, { Component } from "react";

import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import ExternalLink from "metabase/core/components/ExternalLink";
import Confirm from "metabase/components/Confirm";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { t } from "ttag";
import { CardApi, DashboardApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";

import * as MetabaseAnalytics from "metabase/lib/analytics";

export default class PublicLinksListing extends Component {
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
          <table className="ContentTable">
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
                      <Link
                        to={getUrl(link)}
                        onClick={() => this.trackEvent("Entity Link Clicked")}
                        className="text-wrap"
                      >
                        {link.name}
                      </Link>
                    </td>
                    {getPublicUrl && (
                      <td>
                        <ExternalLink
                          href={getPublicUrl(link)}
                          onClick={() => this.trackEvent("Public Link Clicked")}
                          className="link text-wrap"
                        >
                          {getPublicUrl(link)}
                        </ExternalLink>
                      </td>
                    )}
                    {revoke && (
                      <td className="flex layout-centered">
                        <Confirm
                          title={t`Disable this link?`}
                          content={t`They won't work anymore, and can't be restored, but you can create new links.`}
                          action={() => {
                            this.revoke(link);
                            this.trackEvent("Revoked link");
                          }}
                        >
                          <Icon
                            name="close"
                            className="text-light text-medium-hover cursor-pointer"
                          />
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
    getPublicUrl={({ public_uuid }) => Urls.publicQuestion(public_uuid)}
    noLinksMessage={t`No questions have been publicly shared yet.`}
  />
);

export const EmbeddedDashboardListing = () => (
  <div className="bordered rounded full" style={{ maxWidth: 820 }}>
    <PublicLinksListing
      load={DashboardApi.listEmbeddable}
      getUrl={dashboard => Urls.dashboard(dashboard)}
      type={t`Embedded Dashboard Listing`}
      noLinksMessage={t`No dashboards have been embedded yet.`}
    />
  </div>
);

export const EmbeddedQuestionListing = () => (
  <div className="bordered rounded full" style={{ maxWidth: 820 }}>
    <PublicLinksListing
      load={CardApi.listEmbeddable}
      getUrl={question => Urls.question(question)}
      type={t`Embedded Card Listing`}
      noLinksMessage={t`No questions have been embedded yet.`}
    />
  </div>
);
